// Start a research query — spawns an Agent SDK query in the background.
// Thin relay: user messages → SDK query → job-store → poll → UI.

import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import auth from '@/lib/auth';
import { startQuery } from '@/lib/agent-query';
import { extractPapersFromToolResult, extractChartFromToolResult, extractTablesFromMarkdown, isCitationNetwork } from '@/lib/stream-parser';
import { jobStore } from '@/lib/job-store';
import type { ChartData } from '@/types/chart';

export const runtime = 'nodejs';
export const maxDuration = 900;

export async function POST(req: NextRequest) {
  try {
    // Extract Authentik access token from Better Auth session
    let accessToken: string | undefined;
    let hasSession = false;
    try {
      const reqHeaders = await headers();
      const session = await auth.api.getSession({ headers: reqHeaders });
      hasSession = !!session;
      if (session) {
        const tokenData = await auth.api.getAccessToken({
          headers: reqHeaders,
          body: { providerId: "authentik" },
        });
        accessToken = tokenData?.accessToken || undefined;
      }
      console.log(`[auth] Access token: ${accessToken ? 'yes' : 'no'}`);
      if (accessToken) console.log(`[auth][DEBUG] Token: ${accessToken}`);
    } catch {
      // Auth not configured or no session — continue without token
    }

    // Session exists but token is gone → expired, tell frontend to re-auth
    if (hasSession && !accessToken) {
      return new Response(
        JSON.stringify({ error: 'auth_expired', message: 'Session expired. Please sign in again.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { messages, model, previousJobId } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        { status: 400 }
      );
    }

    const jobId = crypto.randomUUID();
    jobStore.create(jobId);

    // Resume previous session for multi-turn conversation
    let resumeSessionId: string | null = null;
    if (previousJobId) {
      resumeSessionId = jobStore.getSessionId(previousJobId);
      if (resumeSessionId) {
        console.log(`[${jobId}] Resuming from session: ${resumeSessionId}`);
      }
    }

    console.log(`[${jobId}] Research query started (${messages.length} messages, auth: ${accessToken ? 'yes' : 'no'})`);

    processQuery(jobId, messages, model || 'claude-sonnet-4-6', accessToken, resumeSessionId);

    return new Response(
      JSON.stringify({ jobId, status: 'started' }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Start endpoint error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown' }),
      { status: 500 }
    );
  }
}

async function processQuery(
  jobId: string,
  messages: any[],
  model: string,
  accessToken?: string,
  resumeSessionId?: string | null,
) {
  try {
    jobStore.setStatus(jobId, 'running');

    const result = await startQuery(messages, model, accessToken, resumeSessionId);

    const startTime = Date.now();
    const allPapers: any[] = [];
    const charts: ChartData[] = [];
    const toolUseMap = new Map<string, string>();
    // Map task_id → tool_use_id for correlating subagent events to Agent tool activities
    const taskToToolMap = new Map<string, string>();
    let finalText = '';

    for await (const message of result) {
      const elapsed = Date.now() - startTime;
      jobStore.updateMetric(jobId, 'elapsedMs', elapsed);

      // System init — capture session ID
      if (message.type === 'system' && (message as any).subtype === 'init') {
        const sessionId = (message as any).session_id;
        if (sessionId) {
          jobStore.setSessionId(jobId, sessionId);
          console.log(`[${jobId}] Session ID: ${sessionId}`);
        }
        continue;
      }

      // Assistant message — text + tool_use blocks
      if (message.type === 'assistant') {
        const content = (message as any).message?.content;
        const isSubagent = !!(message as any).parent_tool_use_id;
        let textChunk = '';

        if (typeof content === 'string') {
          textChunk = content;
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text') {
              textChunk += block.text;
            } else if (block.type === 'tool_use') {
              toolUseMap.set(block.id, block.name);
              jobStore.addToolActivity(jobId, {
                toolName: block.name,
                toolUseId: block.id,
                startedAt: Date.now(),
                status: 'running',
                input: block.input || undefined,
              });
              console.log(`[${jobId}] Tool: ${block.name}${isSubagent ? ' (subagent)' : ''}`);
            }
          }
        }

        // Subagent messages: create tool activities (above) but skip text messages
        // to avoid breaking progress group boundaries with stray assistant-text messages
        if (isSubagent) {
          continue;
        }

        const hasToolUse = Array.isArray(content) && content.some((b: any) => b.type === 'tool_use');

        if (textChunk) {
          if (hasToolUse) {
            // Text accompanying tool calls → thinking/progress block
            jobStore.addMessage(jobId, { type: 'progress', content: textChunk, timestamp: Date.now() });
          } else {
            // Text-only message → regular chat bubble (not thinking block)
            jobStore.addMessage(jobId, { type: 'assistant-text', content: textChunk, timestamp: Date.now() });
            finalText = textChunk;
          }
        } else if (hasToolUse) {
          // Tool-only message with no text — emit a placeholder progress message
          // so the UI creates a new thinking block for this turn's tool activity
          jobStore.addMessage(jobId, { type: 'progress', content: '', timestamp: Date.now() });
        }
        continue;
      }

      // User message — tool results (auto-generated by SDK after tool execution)
      if (message.type === 'user') {
        const isSubagent = !!(message as any).parent_tool_use_id;
        const userContent = (message as any).message?.content;
        if (Array.isArray(userContent)) {
          for (const block of userContent) {
            if (block.type === 'tool_result') {
              const toolName = toolUseMap.get(block.tool_use_id) || 'unknown';
              const isError = !!block.is_error;

              // Build output snippet
              let outputSnippet = '';
              const rawContent = block.content;
              if (typeof rawContent === 'string') {
                outputSnippet = rawContent.slice(0, 200);
              } else if (Array.isArray(rawContent)) {
                const textBlock = rawContent.find((b: any) => b.type === 'text');
                if (textBlock?.text) outputSnippet = textBlock.text.slice(0, 200);
              }

              jobStore.updateToolActivity(jobId, toolName, {
                completedAt: Date.now(),
                status: isError ? 'error' : 'completed',
                outputSnippet: outputSnippet || undefined,
              });

              // Skip heavy extraction for subagent tool results
              // (main agent will present the final results from the Agent tool_result)
              if (isSubagent) {
                console.log(`[${jobId}] Subagent tool result: ${toolName} (${isError ? 'error' : 'ok'})`);
                continue;
              }

              jobStore.addToolCall(jobId, {
                timestamp: Date.now(),
                elapsed: Date.now() - startTime,
                agent: 'claude',
                tool: toolName,
                input: { summary: 'Query executed' },
                output: {
                  success: !isError,
                  summary: outputSnippet ? outputSnippet.slice(0, 100) : (isError ? 'Error' : 'Completed'),
                },
              });

              // Extract papers
              const papers = extractPapersFromToolResult(block.content);
              if (papers.length > 0) {
                allPapers.push(...papers);
                jobStore.updateMetric(jobId, 'papersFound', allPapers.length);
                jobStore.addMessage(jobId, { type: 'papers', count: allPapers.length });
                console.log(`[${jobId}] Papers: +${papers.length} (total: ${allPapers.length})`);
              }

              // Extract charts
              const chart = extractChartFromToolResult(block.content);
              if (chart) {
                charts.push(chart);
                jobStore.updateMetric(jobId, 'chartsCreated', charts.length);
                console.log(`[${jobId}] Chart: ${chart.chartType}`);
              }

              // Track citation networks
              if (isCitationNetwork(block.content)) {
                const job = jobStore.get(jobId);
                if (job) {
                  jobStore.updateMetric(jobId, 'citationNetworksBuilt', job.metrics.citationNetworksBuilt + 1);
                }
              }
            }
          }
        }
        continue;
      }

      // Tool progress — elapsed time updates while tools/subagents run
      if (message.type === 'tool_progress') {
        const { tool_use_id, tool_name, elapsed_time_seconds, task_id } = message as any;
        if (tool_use_id && elapsed_time_seconds != null) {
          jobStore.updateToolActivityById(jobId, tool_use_id, {
            elapsedSeconds: elapsed_time_seconds,
          });
        }
        // Track task_id → tool_use_id mapping for subagent events
        if (task_id && tool_use_id) {
          taskToToolMap.set(task_id, tool_use_id);
        }
        continue;
      }

      // System events — subagent lifecycle
      if (message.type === 'system') {
        const subtype = (message as any).subtype;

        if (subtype === 'task_started') {
          const { task_id, description } = message as any;
          console.log(`[${jobId}] Subagent started: ${description} (task: ${task_id})`);
          continue;
        }

        if (subtype === 'task_progress') {
          const { task_id, last_tool_name } = message as any;
          // Update the parent Agent tool's subStatus (shown on the Agent ToolCallCard)
          const toolUseId = taskToToolMap.get(task_id);
          if (toolUseId && last_tool_name) {
            const displayName = last_tool_name
              .replace(/^mcp__(?:plugin_openaire_)?(?:openaire-local|openaire|viz-tools)__/, '')
              .replace(/^openaire_/, '')
              .replace(/_/g, ' ');
            jobStore.updateToolActivityById(jobId, toolUseId, {
              subStatus: `using ${displayName}`,
            });
          }
          continue;
        }

        if (subtype === 'task_notification') {
          const { task_id, status: taskStatus, summary } = message as any;
          console.log(`[${jobId}] Subagent ${taskStatus}: ${summary || task_id}`);
          continue;
        }

        // Already handled 'init' above, skip other system events
        continue;
      }

      // Result — marks end of turn
      if (message.type === 'result') {
        const usage = (message as any).usage || (message as any).modelUsage || null;

        const uniquePapers = Array.from(
          new Map(allPapers.map((p: any) => [p.id, p])).values()
        );

        console.log(`[${jobId}] Complete: ${uniquePapers.length} papers, ${charts.length} charts, ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

        if (usage) {
          const input = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
          console.log(`[${jobId}] Tokens: ${input.toLocaleString()} in / ${(usage.output_tokens || 0).toLocaleString()} out`);
        }

        // Remove last assistant-text message if it matches finalText (avoid duplicate with complete)
        if (finalText) {
          const job = jobStore.get(jobId);
          if (job) {
            for (let i = job.messages.length - 1; i >= 0; i--) {
              if (job.messages[i].type === 'assistant-text' && job.messages[i].content === finalText) {
                job.messages.splice(i, 1);
                break;
              }
            }
          }
        }

        // Extract markdown tables → viz panel charts
        if (finalText) {
          const { charts: tableCharts, cleanedText } = extractTablesFromMarkdown(finalText);
          if (tableCharts.length > 0) {
            charts.push(...tableCharts);
            finalText = cleanedText;
            console.log(`[${jobId}] Tables: ${tableCharts.length}`);
          }
        }

        jobStore.addMessage(jobId, {
          type: 'complete',
          content: finalText || 'Research complete.',
          researchData: uniquePapers,
          charts,
          usage: usage || {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        });

        jobStore.setStatus(jobId, 'complete');
        break;
      }

      // Debug: log unhandled message types
      console.log(`[${jobId}] Unhandled SDK event: ${message.type}${(message as any).subtype ? '/' + (message as any).subtype : ''}`);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${jobId}] Error: ${errorMessage}`);
    jobStore.setError(jobId, errorMessage);
  }
}
