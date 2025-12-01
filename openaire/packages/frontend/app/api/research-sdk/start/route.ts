// Start a research query - returns jobId immediately, processes in background
import { NextRequest } from 'next/server';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { RESEARCH_SUBAGENTS, ORCHESTRATOR_PROMPT } from '@/lib/research-agents';
import { jobStore } from '@/lib/job-store';
import path from 'path';
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk/sdk';
import type { ChartData } from '@/types/chart';

export const runtime = 'nodejs';
export const maxDuration = 900; // 15 minutes to allow long-running agent sessions

// Agent types
type AgentType = 'data-discovery' | 'citation-impact' | 'network-analysis' | 'trends-analysis' | 'visualization';

async function* createPromptIterator(messages: any[]): AsyncGenerator<SDKUserMessage> {
  // When resuming, only send the latest user message
  // The SDK will automatically load conversation history
  const sessionId = crypto.randomUUID();

  // Find the latest user message (skip thinking placeholders)
  const userMessages = messages.filter(
    msg => msg.role === 'user' && msg.content && msg.content !== 'thinking'
  );

  if (userMessages.length === 0) {
    return;
  }

  // Only yield the latest user message
  const latestUserMessage = userMessages[userMessages.length - 1];

  yield {
    type: 'user',
    message: {
      role: 'user',
      content: typeof latestUserMessage.content === 'string'
        ? latestUserMessage.content
        : JSON.stringify(latestUserMessage.content)
    },
    parent_tool_use_id: null,
    session_id: sessionId
  } as SDKUserMessage;
}

export async function POST(req: NextRequest) {
  try {
    const { messages, model, previousJobId } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        { status: 400 }
      );
    }

    // Create job
    const jobId = crypto.randomUUID();
    jobStore.create(jobId);

    // Check if we should resume a previous session
    let resumeSessionId: string | null = null;
    if (previousJobId) {
      resumeSessionId = jobStore.getSessionId(previousJobId);
      if (resumeSessionId) {
        console.log(`[${jobId}] Resuming session: ${resumeSessionId} from job ${previousJobId}`);
      }
    }

    console.log(`[${jobId}] Research query started`);
    console.log(`[${jobId}] Total messages received: ${messages.length}`);
    console.log(`[${jobId}] Message breakdown:`, messages.map((m, i) => ({
      index: i,
      role: m.role,
      type: m.messageType,
      contentPreview: m.content?.substring(0, 50) || 'empty'
    })));

    // Start processing in background (don't await!)
    // Default to Sonnet for orchestrator - it handles large contexts and complex
    // multi-agent coordination better than Haiku, avoiding long response delays
    processQuery(jobId, messages, model || 'claude-sonnet-4-5-20250929', resumeSessionId);

    // Return immediately
    return new Response(
      JSON.stringify({ jobId, status: 'started' }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Start endpoint error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown' }),
      { status: 500 }
    );
  }
}

// Background processor
async function processQuery(jobId: string, messages: any[], model: string, resumeSessionId: string | null = null) {
  try {
    jobStore.setStatus(jobId, 'running');

    const mcpServerPath = path.join(process.cwd(), '..', 'mcp', 'dist', 'index.js');
    const vizMcpServerPath = path.join(process.cwd(), '..', 'viz-mcp', 'dist', 'index.js');

    // Agent instance tracking map: agentId -> { type, instanceId }
    const activeAgents = new Map<string, { type: AgentType; instanceId: string }>();

    // Build query options
    const queryOptions: any = {
      model,
      systemPrompt: ORCHESTRATOR_PROMPT,
        mcpServers: {
          openaire: {
            command: 'node',
            args: [mcpServerPath],
            env: { ...process.env, LOG_LEVEL: 'info' }
          },
          'viz-tools': {
            command: 'node',
            args: [vizMcpServerPath],
            env: { ...process.env, LOG_LEVEL: 'info' }
          }
        },
        agents: RESEARCH_SUBAGENTS,
        hooks: {
          'SubagentStart': [{
            hooks: [async (input: any) => {
              const startInput = input as any;
              const agentType = startInput.agent_type as AgentType;
              const agentId = startInput.agent_id;

              console.log(`[${jobId}] 🚀 SUBAGENT START: ${agentType} (id: ${agentId})`);

              // Create agent instance in job store
              const instanceId = jobStore.startAgentInstance(jobId, agentType, `Starting ${agentType}...`);
              activeAgents.set(agentId, { type: agentType, instanceId });

              console.log(`[${jobId}]    Created instance: ${instanceId}`);

              return { continue: true };
            }]
          }],
          'SubagentStop': [{
            hooks: [async (input: any) => {
              const stopInput = input as any;
              const agentId = stopInput.agent_id;

              const agentInfo = activeAgents.get(agentId);
              if (agentInfo) {
                console.log(`[${jobId}] 🛑 SUBAGENT STOP: ${agentInfo.type} (id: ${agentId})`);

                // Complete agent instance in job store
                jobStore.updateAgentInstance(jobId, agentInfo.type, agentInfo.instanceId, {
                  status: 'completed'
                });

                activeAgents.delete(agentId);
                console.log(`[${jobId}]    Completed instance: ${agentInfo.instanceId}`);
              } else {
                console.warn(`[${jobId}] ⚠️  SubagentStop for unknown agent: ${agentId}`);
              }

              return { continue: true };
            }]
          }]
        },
        allowedTools: [
          // Original OpenAIRE tools
          'mcp__openaire__search_research_products',
          'mcp__openaire__get_research_product_details',
          'mcp__openaire__get_citation_network',
          // New OpenAIRE tools
          'mcp__openaire__search_organizations',
          'mcp__openaire__search_projects',
          'mcp__openaire__get_author_profile',
          'mcp__openaire__search_datasets',
          'mcp__openaire__analyze_coauthorship_network',
          'mcp__openaire__get_project_outputs',
          // Citation class tools (4 tools for different indicators)
          'mcp__openaire__find_by_influence_class',
          'mcp__openaire__find_by_popularity_class',
          'mcp__openaire__find_by_impulse_class',
          'mcp__openaire__find_by_citation_count_class',
          'mcp__openaire__explore_research_relationships',
          'mcp__openaire__search_data_sources',
          'mcp__openaire__analyze_research_trends',
          'mcp__openaire__build_subgraph_from_dois',
          // System tools
          'Bash',
          'Read',
          'Write',
          'Grep',
          'Glob',
          // Visualization tools
          'mcp__viz-tools__create_citation_network_chart',
          'mcp__viz-tools__create_timeline_chart',
          'mcp__viz-tools__create_distribution_chart',
          'mcp__viz-tools__merge_citation_networks'
        ],
        permissionMode: 'acceptEdits'
    };

    // Add resume option if we have a session to continue
    if (resumeSessionId) {
      queryOptions.resume = resumeSessionId;
      console.log(`[${jobId}] Using resume option with session: ${resumeSessionId}`);
    }

    const result = query({
      prompt: createPromptIterator(messages),
      options: queryOptions
    });

    const startTime = Date.now();
    let allPapers: any[] = [];
    let charts: ChartData[] = [];  // Store charts from visualization tools
    let progressText: string[] = [];  // Store progress messages
    let finalText = '';  // Store only the final response
    let messageCount = 0;

    // Track token usage from final result (SDK provides cumulative totals)
    let finalUsage: any = null;

    // Track tool use IDs to tool names mapping
    const toolUseMap = new Map<string, string>();

    console.log(`\n${'='.repeat(80)}`);
    console.log(`[${jobId}] 🚀 AGENT PROCESSING STARTED`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Model: ${model}`);
    console.log(`Initial messages: ${messages.length}`);
    console.log(`Start time: ${new Date(startTime).toISOString()}\n`);

    for await (const message of result) {
      messageCount++;
      const elapsed = Date.now() - startTime;
      jobStore.updateMetric(jobId, 'elapsedMs', elapsed);

      // Check if approaching timeout (warn at 90% of maxDuration)
      const maxDurationMs = maxDuration * 1000;
      const timeoutWarningThreshold = maxDurationMs * 0.9;
      if (elapsed > timeoutWarningThreshold) {
        console.warn(`[${jobId}] ⚠️  APPROACHING TIMEOUT: ${(elapsed / 1000).toFixed(0)}s / ${maxDuration}s`);
        console.warn(`[${jobId}]     Stream may close soon. Consider breaking this into smaller tasks.`);
      }

      console.log(`\n${'-'.repeat(80)}`);
      console.log(`[${jobId}] 📨 Message #${messageCount} | Type: ${message.type} | Elapsed: ${(elapsed / 1000).toFixed(2)}s`);
      console.log(`${'-'.repeat(80)}`);

      // Capture session ID from system init message
      if (message.type === 'system' && (message as any).subtype === 'init') {
        const sessionId = (message as any).session_id;
        if (sessionId) {
          jobStore.setSessionId(jobId, sessionId);
          console.log(`[${jobId}] 📌 Captured session ID: ${sessionId}`);
        }
      }

      if (message.type === 'assistant') {
        console.log(`[${jobId}] 🤖 ASSISTANT MESSAGE`);
        const content = message.message.content;
        let textChunk = '';
        let toolUseCount = 0;

        if (typeof content === 'string') {
          textChunk = content;
        } else if (Array.isArray(content)) {
          console.log(`[${jobId}]    Content blocks: ${content.length}`);
          for (const block of content) {
            if (block.type === 'text') {
              textChunk += block.text;
            } else if (block.type === 'tool_use') {
              toolUseCount++;
              // Store tool use ID -> name mapping
              toolUseMap.set(block.id, block.name);
              console.log(`[${jobId}]    🔧 Tool use #${toolUseCount}: ${block.name}`);
              console.log(`[${jobId}]       Input: ${JSON.stringify(block.input).substring(0, 150)}...`);
            }
          }
        }

        if (textChunk) {
          const preview = textChunk.substring(0, 300).replace(/\n/g, ' ');
          console.log(`[${jobId}]    💭 Agent thinking: "${preview}${textChunk.length > 300 ? '...' : ''}"`);
          console.log(`[${jobId}]    Text length: ${textChunk.length} chars`);

          // Always show text as progress message in the UI
          progressText.push(textChunk);
          jobStore.addMessage(jobId, { type: 'progress', content: textChunk });
          console.log(`[${jobId}]    📝 Saved as progress message`);

          // If no tool uses, this might be the final synthesis message
          // Keep track of it, and it will be used as the final text at the end
          if (toolUseCount === 0) {
            finalText = textChunk;  // Store as potential final text
            console.log(`[${jobId}]    ✨ Potential final synthesis (no tool uses)`);
          }
        }

        if (toolUseCount > 0) {
          console.log(`[${jobId}]    📊 Tool uses in this message: ${toolUseCount}`);
        }
      }

      if (message.type === 'user') {
        console.log(`[${jobId}] 👤 USER MESSAGE (Tool Results)`);
        const userContent = message.message.content;
        let toolResultCount = 0;

        if (Array.isArray(userContent)) {
          console.log(`[${jobId}]    Content blocks: ${userContent.length}`);

          for (const block of userContent) {
            if (block.type === 'tool_result') {
              toolResultCount++;
              const isError = 'is_error' in block && block.is_error;

              console.log(`[${jobId}]    ✅ Tool result #${toolResultCount}${isError ? ' (ERROR)' : ''}`);

              if (isError) {
                console.log(`[${jobId}]       ❌ Tool Error (is_error=true):`);
                const errorContent = typeof block.content === 'string' ? block.content : JSON.stringify(block.content, null, 2);
                console.log(`[${jobId}]          ${errorContent}`);
                continue;
              }

              let toolData;
              if (typeof block.content === 'string') {
                try {
                  toolData = JSON.parse(block.content);
                } catch {
                  console.log(`[${jobId}]       ⚠️ Failed to parse tool result as JSON`);
                  continue;
                }
              } else if (Array.isArray(block.content)) {
                // MCP SDK format: [{"type": "text", "text": "{...}"}]
                const textBlock = block.content.find((b: any) => b.type === 'text');
                if (textBlock && textBlock.text) {
                  // Check if it looks like JSON before parsing
                  const text = textBlock.text.trim();
                  if (!text.startsWith('{') && !text.startsWith('[')) {
                    // Plain text response (agent communication) - show it as progress!
                    console.log(`[${jobId}]       💬 Tool returned plain text (agent communication): "${text.substring(0, 100)}..."`);

                    // Add this as a progress message with agent prefix for the UI
                    jobStore.addMessage(jobId, {
                      type: 'progress',
                      content: `**[Agent Communication]** ${text}`
                    });

                    continue;
                  }

                  try {
                    toolData = JSON.parse(text);
                    console.log(`[${jobId}]       📦 Parsed MCP text block successfully`);
                  } catch (e) {
                    console.log(`[${jobId}]       ⚠️ Failed to parse MCP text block as JSON (skipping)`);
                    console.log(`[${jobId}]          Error: ${e instanceof Error ? e.message : 'Unknown'}`);
                    console.log(`[${jobId}]          Text: ${text.substring(0, 200)}`);
                    continue;
                  }
                } else {
                  console.log(`[${jobId}]       ⚠️ No text block found in array content`);
                  continue;
                }
              } else {
                toolData = block.content;
              }

              // Check if this is a visualization tool result
              // Viz tools return: { visualization: ChartData }
              if (toolData && toolData.visualization) {
                console.log(`[${jobId}]       📊 Visualization tool result detected:`, {
                  chartType: toolData.visualization.chartType,
                  hasNetwork: !!toolData.visualization.networkData
                });
                charts.push(toolData.visualization);
                jobStore.updateMetric(jobId, 'chartsCreated', charts.length);
                continue;  // Skip further processing for viz results
              }

              // Log tool call
              if (toolData) {
                let summary = 'Tool completed';
                let count = 0;

                if ('success' in toolData && toolData.success && toolData.data) {
                  // Handle research products
                  if (Array.isArray(toolData.data.results)) {
                    count = toolData.data.results.length;
                    summary = `${count} research products`;
                    allPapers.push(...toolData.data.results);
                    jobStore.updateMetric(jobId, 'papersFound', allPapers.length);
                    console.log(`[${jobId}]       📚 Found ${count} research products (total: ${allPapers.length})`);
                  }
                  // Handle datasets
                  else if (Array.isArray(toolData.data.datasets)) {
                    count = toolData.data.datasets.length;
                    summary = `${count} datasets`;
                    allPapers.push(...toolData.data.datasets);
                    jobStore.updateMetric(jobId, 'papersFound', allPapers.length);
                    console.log(`[${jobId}]       📊 Found ${count} datasets (total: ${allPapers.length})`);
                  }
                  // Handle project outputs
                  else if (Array.isArray(toolData.data.outputs)) {
                    count = toolData.data.outputs.length;
                    summary = `${count} project outputs`;
                    allPapers.push(...toolData.data.outputs);
                    jobStore.updateMetric(jobId, 'papersFound', allPapers.length);
                    console.log(`[${jobId}]       📦 Found ${count} project outputs (total: ${allPapers.length})`);
                  }
                  // Handle author publications
                  else if (Array.isArray(toolData.data.publications)) {
                    count = toolData.data.publications.length;
                    summary = `${count} publications`;
                    allPapers.push(...toolData.data.publications);
                    jobStore.updateMetric(jobId, 'papersFound', allPapers.length);
                    console.log(`[${jobId}]       👤 Found ${count} author publications (total: ${allPapers.length})`);
                  }
                  // Handle highly cited papers
                  else if (Array.isArray(toolData.data.papers)) {
                    count = toolData.data.papers.length;
                    summary = `${count} highly cited`;
                    allPapers.push(...toolData.data.papers);
                    jobStore.updateMetric(jobId, 'papersFound', allPapers.length);
                    console.log(`[${jobId}]       ⭐ Found ${count} highly cited papers (total: ${allPapers.length})`);
                  }
                  // Handle organizations
                  else if (Array.isArray(toolData.data.organizations)) {
                    count = toolData.data.organizations.length;
                    summary = `${count} organizations`;
                    console.log(`[${jobId}]       🏛️  Found ${count} organizations`);
                  }
                  // Handle projects
                  else if (Array.isArray(toolData.data.projects)) {
                    count = toolData.data.projects.length;
                    summary = `${count} projects`;
                    console.log(`[${jobId}]       💰 Found ${count} funded projects`);
                  }
                  // Handle data sources
                  else if (Array.isArray(toolData.data.dataSources)) {
                    count = toolData.data.dataSources.length;
                    summary = `${count} data sources`;
                    console.log(`[${jobId}]       🗄️  Found ${count} data sources/repositories`);
                  }
                  // Handle relationships
                  else if (Array.isArray(toolData.data.relationships)) {
                    count = toolData.data.relationships.length;
                    summary = `${count} relationships`;
                    console.log(`[${jobId}]       🔗 Found ${count} semantic relationships`);
                  }
                  // Handle research trends
                  else if (Array.isArray(toolData.data.trends)) {
                    count = toolData.data.trends.length;
                    summary = `Trends: ${count} years`;
                    console.log(`[${jobId}]       📈 Analyzed ${count} years (${toolData.data.summary?.totalPapers || 0} papers)`);
                  }
                  // Handle networks (citation or co-authorship)
                  else if (toolData.data.nodes) {
                    count = toolData.data.nodes.length;
                    const isCoauthorship = toolData.data.centerAuthor || toolData.data.metadata?.totalAuthors;
                    summary = isCoauthorship ? `Co-authorship: ${count} authors` : `Network: ${count} nodes`;

                    if (!isCoauthorship) {
                      jobStore.updateMetric(jobId, 'citationNetworksBuilt', jobStore.get(jobId)!.metrics.citationNetworksBuilt + 1);
                    }
                    console.log(`[${jobId}]       🕸️  ${summary}, ${toolData.data.edges?.length || 0} edges`);
                  }
                  // Handle single entities
                  else if (toolData.data.id) {
                    summary = 'Single entity';
                    const title = toolData.data.title || toolData.data.legalName || toolData.data.officialName || 'Unknown';
                    console.log(`[${jobId}]       📄 Single entity: ${title.substring(0, 80)}...`);
                  }
                  else {
                    console.log(`[${jobId}]       ℹ️  Tool result: ${JSON.stringify(toolData).substring(0, 150)}...`);
                  }
                } else if ('success' in toolData && !toolData.success) {
                  console.log(`[${jobId}]       ⚠️ Tool reported failure`);
                  console.log(`[${jobId}]          Error: ${JSON.stringify(toolData.error || toolData)}`);
                } else {
                  // Unexpected format
                  console.log(`[${jobId}]       ⚠️ Unexpected tool data format (no 'success' field)`);
                  console.log(`[${jobId}]          Raw data: ${JSON.stringify(toolData).substring(0, 300)}...`);
                }

                // Look up tool name from the tool_use_id
                const toolName = toolUseMap.get((block as any).tool_use_id) || 'unknown';

                jobStore.addToolCall(jobId, {
                  timestamp: Date.now(),
                  elapsed,
                  agent: 'orchestrator', // All tools tracked under orchestrator
                  tool: toolName,
                  input: { summary: 'Query executed' },
                  output: {
                    success: toolData?.success || false,
                    summary,
                    count
                  }
                });

                // Agent-specific progress is tracked via SubagentStart/Stop hooks
              }

              if (toolData && toolData.success && toolData.data) {
                // Handle search results (papers)
                if (Array.isArray(toolData.data.results)) {
                  allPapers.push(...toolData.data.results);
                  jobStore.addMessage(jobId, {
                    type: 'papers',
                    count: allPapers.length
                  });
                }
                // Handle datasets array
                else if (Array.isArray(toolData.data.datasets)) {
                  allPapers.push(...toolData.data.datasets);
                  jobStore.addMessage(jobId, {
                    type: 'papers',
                    count: allPapers.length
                  });
                }
                // Handle project outputs
                else if (Array.isArray(toolData.data.outputs)) {
                  allPapers.push(...toolData.data.outputs);
                  jobStore.addMessage(jobId, {
                    type: 'papers',
                    count: allPapers.length
                  });
                }
                // Handle author profile publications
                else if (Array.isArray(toolData.data.publications)) {
                  allPapers.push(...toolData.data.publications);
                  jobStore.addMessage(jobId, {
                    type: 'papers',
                    count: allPapers.length
                  });
                }
                // Handle highly cited papers
                else if (Array.isArray(toolData.data.papers)) {
                  allPapers.push(...toolData.data.papers);
                  jobStore.addMessage(jobId, {
                    type: 'papers',
                    count: allPapers.length
                  });
                }
                // Handle single paper/product
                else if (toolData.data.id && toolData.data.title) {
                  allPapers.push(toolData.data);
                  console.log(`[${jobId}]       📄 Added single paper`);
                }
                // Handle citation networks and co-authorship networks
                else if (toolData.data.nodes && Array.isArray(toolData.data.edges)) {
                  // Check if this is a co-authorship network vs citation network
                  const isCoauthorship = toolData.data.centerAuthor || toolData.data.metadata?.totalAuthors;

                  if (isCoauthorship) {
                    // Co-authorship network - just log it
                    console.log(`[${jobId}]       🤝 Co-authorship network: ${toolData.data.nodes.length} authors, ${toolData.data.edges.length} collaborations`);
                  } else {
                    // Citation network data - agent should use viz tools to create charts
                    // Extract papers for the paper list only
                    const networkPapers = toolData.data.nodes.map((node: any) => ({
                      id: node.id,
                      title: node.title,
                      type: node.type || 'publication',
                      publicationDate: `${node.year}-01-01`,
                      citations: node.citations || 0,
                      openAccess: node.openAccess,
                      authors: []
                    }));
                    allPapers.push(...networkPapers);
                    console.log(`[${jobId}]       🕸️  Added ${networkPapers.length} papers from citation network data`);
                  }
                }
                // Handle research trends (from analyze_research_trends)
                else if (Array.isArray(toolData.data.trends)) {
                  console.log(`[${jobId}]       📈 Research trends: ${toolData.data.trends.length} years analyzed`);
                  console.log(`[${jobId}]          Total papers: ${toolData.data.summary?.totalPapers || 0}`);
                  console.log(`[${jobId}]          Peak year: ${toolData.data.summary?.peakYear} (${toolData.data.summary?.peakCount} papers)`);
                }
                // Handle organizations (from search_organizations)
                else if (Array.isArray(toolData.data.organizations)) {
                  console.log(`[${jobId}]       🏛️  Found ${toolData.data.organizations.length} organizations`);
                }
                // Handle projects (from search_projects)
                else if (Array.isArray(toolData.data.projects)) {
                  console.log(`[${jobId}]       💰 Found ${toolData.data.projects.length} projects`);
                }
                // Handle data sources (from search_data_sources)
                else if (Array.isArray(toolData.data.dataSources)) {
                  console.log(`[${jobId}]       🗄️  Found ${toolData.data.dataSources.length} data sources`);
                }
                // Handle research relationships (from explore_research_relationships)
                else if (Array.isArray(toolData.data.relationships)) {
                  console.log(`[${jobId}]       🔗 Found ${toolData.data.relationships.length} research relationships`);
                  if (toolData.data.summary?.byType) {
                    console.log(`[${jobId}]          Types: ${JSON.stringify(toolData.data.summary.byType)}`);
                  }
                }
              }
            }
          }
        }
      }

      if (message.type === 'result') {
        console.log(`[${jobId}] 🎯 FINAL RESULT RECEIVED`);

        // Capture final usage (SDK provides cumulative totals in result message)
        if ('usage' in message && message.usage) {
          finalUsage = message.usage;
        }

        const endTime = Date.now();
        const totalDuration = (endTime - startTime) / 1000;

        const uniquePapers = Array.from(
          new Map(allPapers.map(p => [p.id, p])).values()
        );

        // Charts are now created by agents using visualization tools
        // No auto-generation - agents have full control

        const jobData = jobStore.get(jobId);

        console.log(`\n${'='.repeat(80)}`);
        console.log(`[${jobId}] 🏁 AGENT PROCESSING COMPLETE`);
        console.log(`${'='.repeat(80)}`);
        console.log(`⏱️  Total Duration: ${totalDuration.toFixed(2)}s`);
        console.log(`📨 Total Messages: ${messageCount}`);
        console.log(`🔧 Tool Calls: ${jobData?.metrics.toolCallCount || 0}`);
        console.log(`📚 Papers Collected: ${allPapers.length} (${uniquePapers.length} unique)`);
        console.log(`🕸️  Citation Networks: ${jobData?.metrics.citationNetworksBuilt || 0}`);
        console.log(`📊 Charts Created by Agent: ${charts.length}`);
        console.log(`💬 Response Length: ${finalText.length} chars`);

        // Display token usage from final result
        if (finalUsage) {
          const inputTokens = (finalUsage.input_tokens || 0) + (finalUsage.cache_creation_input_tokens || 0) + (finalUsage.cache_read_input_tokens || 0);
          const outputTokens = finalUsage.output_tokens || 0;

          console.log(`\n📊 Token Usage:`);
          console.log(`   Input tokens: ${inputTokens.toLocaleString()}`);
          if (finalUsage.cache_creation_input_tokens || finalUsage.cache_read_input_tokens) {
            console.log(`     - Base input: ${(finalUsage.input_tokens || 0).toLocaleString()}`);
            if (finalUsage.cache_creation_input_tokens) {
              console.log(`     - Cache creation: ${finalUsage.cache_creation_input_tokens.toLocaleString()}`);
            }
            if (finalUsage.cache_read_input_tokens) {
              console.log(`     - Cache read: ${finalUsage.cache_read_input_tokens.toLocaleString()}`);
            }
          }
          console.log(`   Output tokens: ${outputTokens.toLocaleString()}`);
          console.log(`   Total tokens: ${(inputTokens + outputTokens).toLocaleString()}`);

          if (finalUsage.total_cost_usd) {
            console.log(`   Total cost: $${finalUsage.total_cost_usd.toFixed(6)}`);
          }
        } else {
          console.log(`\n📊 Token Usage: Not available`);
        }

        console.log(`\n🎯 Agent Status Summary:`);
        const agentStats = jobStore.getAgentStats(jobId);
        console.log(`   Data Discovery: ${agentStats['data-discovery'].total} instances (✓${agentStats['data-discovery'].completed} ⏳${agentStats['data-discovery'].running} ⏸${agentStats['data-discovery'].starting})`);
        console.log(`   Citation Impact: ${agentStats['citation-impact'].total} instances (✓${agentStats['citation-impact'].completed} ⏳${agentStats['citation-impact'].running} ⏸${agentStats['citation-impact'].starting})`);
        console.log(`   Network Analysis: ${agentStats['network-analysis'].total} instances (✓${agentStats['network-analysis'].completed} ⏳${agentStats['network-analysis'].running} ⏸${agentStats['network-analysis'].starting})`);
        console.log(`   Trends Analysis: ${agentStats['trends-analysis'].total} instances (✓${agentStats['trends-analysis'].completed} ⏳${agentStats['trends-analysis'].running} ⏸${agentStats['trends-analysis'].starting})`);
        console.log(`   Visualization: ${agentStats['visualization'].total} instances (✓${agentStats['visualization'].completed} ⏳${agentStats['visualization'].running} ⏸${agentStats['visualization'].starting})`);
        console.log(`${'='.repeat(80)}\n`);

        // Complete all running/starting agent instances (cleanup)
        const job = jobStore.get(jobId);
        if (job) {
          const agentTypes: AgentType[] = ['data-discovery', 'citation-impact', 'network-analysis', 'trends-analysis', 'visualization'];
          agentTypes.forEach(agentType => {
            job.agents[agentType].forEach(instance => {
              if (instance.status === 'starting' || instance.status === 'running') {
                jobStore.updateAgentInstance(jobId, agentType, instance.id, { status: 'completed' });
              }
            });
          });
        }

        jobStore.addMessage(jobId, {
          type: 'complete',
          content: finalText || 'Research complete.',
          researchData: uniquePapers,
          charts,
          usage: finalUsage || {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0
          }
        });

        jobStore.setStatus(jobId, 'complete');
        break;
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isStreamClosed = errorMessage.includes('Stream closed') || errorMessage.includes('stream');

    console.error(`\n${'='.repeat(80)}`);
    console.error(`[${jobId}] ❌ AGENT PROCESSING ERROR`);
    console.error(`${'='.repeat(80)}`);
    console.error(`Error: ${errorMessage}`);
    console.error(`Stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);

    if (isStreamClosed) {
      console.error(`\n⚠️  Stream closed error detected. This is likely due to:`);
      console.error(`   1. Timeout exceeded (maxDuration = ${maxDuration}s)`);
      console.error(`   2. Connection closed by client`);
      console.error(`   3. Network interruption`);
      console.error(`\nConsider:`);
      console.error(`   - Breaking the task into smaller queries`);
      console.error(`   - Increasing maxDuration in route.ts`);
      console.error(`   - Using pagination for large result sets`);
    }

    console.error(`${'='.repeat(80)}\n`);

    const userFriendlyError = isStreamClosed
      ? `Operation timed out after ${Math.floor((Date.now() - Date.now()) / 1000)}s. The task may be too complex. Try breaking it into smaller queries.`
      : errorMessage;

    jobStore.setError(jobId, userFriendlyError);
  }
}
