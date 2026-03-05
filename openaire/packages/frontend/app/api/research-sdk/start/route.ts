// Start a research query — spawns a real Claude Code CLI process.
// Thin relay: user messages → claude -p stdin, stdout JSONL → job-store → poll → UI.

import { NextRequest } from 'next/server';
import { getOrCreateProcess, writeUserMessage, destroyProcess } from '@/lib/claude-process';
import { extractPapersFromToolResult, extractChartFromToolResult, extractTablesFromMarkdown, isCitationNetwork } from '@/lib/stream-parser';
import { jobStore } from '@/lib/job-store';
import type { ChartData } from '@/types/chart';

export const runtime = 'nodejs';
export const maxDuration = 900;

export async function POST(req: NextRequest) {
  try {
    const { messages, model, previousJobId } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        { status: 400 }
      );
    }

    const jobId = crypto.randomUUID();
    jobStore.create(jobId);

    // Chat session key: reuse previous job's key for multi-turn conversation
    const chatSessionKey = previousJobId || jobId;

    console.log(`[${jobId}] Research query started (${messages.length} messages, session: ${chatSessionKey})`);

    processQuery(jobId, chatSessionKey, messages, model || 'claude-opus-4-6');

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

async function processQuery(jobId: string, chatSessionKey: string, messages: any[], model: string) {
  try {
    jobStore.setStatus(jobId, 'running');

    // Get or create persistent Claude process for this chat session
    let proc;
    try {
      proc = getOrCreateProcess(chatSessionKey, model);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to spawn Claude process';
      console.error(`[${jobId}] Process spawn error: ${msg}`);
      jobStore.setError(jobId, msg);
      return;
    }

    // Extract latest user message
    const userMessages = messages.filter(
      (msg: any) => msg.role === 'user' && msg.content && msg.content !== 'thinking'
    );
    if (userMessages.length === 0) {
      jobStore.setError(jobId, 'No user message found');
      return;
    }
    const latestUserMessage = userMessages[userMessages.length - 1];
    const userText = typeof latestUserMessage.content === 'string'
      ? latestUserMessage.content
      : JSON.stringify(latestUserMessage.content);

    // Shared extraction state for this turn
    const allPapers: any[] = [];
    const charts: ChartData[] = [];
    const startTime = Date.now();
    const toolUseMap = new Map<string, string>();
    let finalText = '';
    let turnComplete = false;

    // Set up event handler for JSONL lines
    const handler = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let obj: any;
      try {
        obj = JSON.parse(trimmed);
      } catch {
        return;
      }

      const elapsed = Date.now() - startTime;
      jobStore.updateMetric(jobId, 'elapsedMs', elapsed);

      // System init — capture session ID
      if (obj.type === 'system' && obj.subtype === 'init') {
        const sessionId = obj.session_id;
        if (sessionId) {
          proc!.sessionId = sessionId;
          jobStore.setSessionId(jobId, sessionId);
          console.log(`[${jobId}] Session ID: ${sessionId}`);
        }
        return;
      }

      // Assistant message — text chunks and tool_use blocks
      if (obj.type === 'assistant') {
        const content = obj.message?.content;
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
              console.log(`[${jobId}] Tool: ${block.name}`);
            }
          }
        }

        if (textChunk) {
          jobStore.addMessage(jobId, { type: 'progress', content: textChunk, timestamp: Date.now() });
          // Track potential final synthesis (text without tool_use in same block)
          const hasToolUse = Array.isArray(content) && content.some((b: any) => b.type === 'tool_use');
          if (!hasToolUse) {
            finalText = textChunk;
          }
        }
        return;
      }

      // User message — tool results (auto-generated by Claude Code)
      if (obj.type === 'user') {
        const userContent = obj.message?.content;
        if (Array.isArray(userContent)) {
          for (const block of userContent) {
            if (block.type === 'tool_result') {
              const toolName = toolUseMap.get(block.tool_use_id) || 'unknown';
              const isError = !!block.is_error;

              // Build output snippet (first ~200 chars of result content)
              let outputSnippet = '';
              const rawContent = block.content;
              if (typeof rawContent === 'string') {
                outputSnippet = rawContent.slice(0, 200);
              } else if (Array.isArray(rawContent)) {
                const textBlock = rawContent.find((b: any) => b.type === 'text');
                if (textBlock?.text) outputSnippet = textBlock.text.slice(0, 200);
              }

              // Complete tool activity with output snippet
              jobStore.updateToolActivity(jobId, toolName, {
                completedAt: Date.now(),
                status: isError ? 'error' : 'completed',
                outputSnippet: outputSnippet || undefined,
              });

              // Log tool call for timeline
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

              // Extract papers from tool result
              const papers = extractPapersFromToolResult(block.content);
              if (papers.length > 0) {
                allPapers.push(...papers);
                jobStore.updateMetric(jobId, 'papersFound', allPapers.length);
                jobStore.addMessage(jobId, { type: 'papers', count: allPapers.length });
                console.log(`[${jobId}] extractPapers: +${papers.length} (total: ${allPapers.length})`);
              }

              // Extract charts from tool result
              const chart = extractChartFromToolResult(block.content);
              if (chart) {
                charts.push(chart);
                jobStore.updateMetric(jobId, 'chartsCreated', charts.length);
                console.log(`[${jobId}] extractCharts: +1 (total: ${charts.length}, type: ${chart.chartType})`);
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
        return;
      }

      // Result — marks end of turn
      if (obj.type === 'result') {
        const usage = obj.usage || null;

        const uniquePapers = Array.from(
          new Map(allPapers.map((p: any) => [p.id, p])).values()
        );

        console.log(`[${jobId}] Complete: ${uniquePapers.length} papers, ${charts.length} charts, ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

        if (usage) {
          const input = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
          console.log(`[${jobId}] Tokens: ${input.toLocaleString()} in / ${(usage.output_tokens || 0).toLocaleString()} out`);
        }

        // Remove the last progress message if it matches finalText to avoid
        // showing the same content in both the thinking block and the final message
        // (must happen before table extraction modifies finalText)
        if (finalText) {
          const job = jobStore.get(jobId);
          if (job) {
            for (let i = job.messages.length - 1; i >= 0; i--) {
              if (job.messages[i].type === 'progress' && job.messages[i].content === finalText) {
                job.messages.splice(i, 1);
                break;
              }
            }
          }
        }

        // Extract markdown tables from final text → viz panel charts
        if (finalText) {
          const { charts: tableCharts, cleanedText } = extractTablesFromMarkdown(finalText);
          if (tableCharts.length > 0) {
            charts.push(...tableCharts);
            finalText = cleanedText;
            console.log(`[${jobId}] Extracted ${tableCharts.length} table(s) from markdown → viz panel`);
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
        turnComplete = true;

        // Remove this handler — turn is done; process stays alive for next turn
        proc!.readline.removeListener('line', handler);
        return;
      }
    };

    proc.readline.on('line', handler);

    // Handle process death mid-turn
    const exitHandler = (code: number | null) => {
      if (!turnComplete) {
        console.error(`[${jobId}] Claude process died mid-turn (code=${code})`);
        proc!.readline.removeListener('line', handler);
        jobStore.setError(jobId, `Claude process exited unexpectedly (code=${code})`);
        destroyProcess(chatSessionKey);
      }
    };
    proc.process.once('exit', exitHandler);

    // Write user message to Claude's stdin
    try {
      writeUserMessage(proc, userText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to write to Claude process';
      console.error(`[${jobId}] Write error: ${msg}`);
      proc.readline.removeListener('line', handler);
      proc.process.removeListener('exit', exitHandler);
      jobStore.setError(jobId, msg);
      destroyProcess(chatSessionKey);
      return;
    }

    // Clean up exit handler when turn completes
    // (We use a polling approach since readline events are async)
    const cleanupInterval = setInterval(() => {
      if (turnComplete) {
        proc!.process.removeListener('exit', exitHandler);
        clearInterval(cleanupInterval);
      }
    }, 1000);

    // Safety timeout — kill after 10 minutes of no result
    setTimeout(() => {
      if (!turnComplete) {
        console.error(`[${jobId}] Turn timed out after 10 minutes`);
        proc!.readline.removeListener('line', handler);
        proc!.process.removeListener('exit', exitHandler);
        clearInterval(cleanupInterval);
        if (jobStore.get(jobId)?.status === 'running') {
          jobStore.setError(jobId, 'Turn timed out after 10 minutes');
        }
      }
    }, 10 * 60 * 1000);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${jobId}] Error: ${errorMessage}`);
    jobStore.setError(jobId, errorMessage);
  }
}
