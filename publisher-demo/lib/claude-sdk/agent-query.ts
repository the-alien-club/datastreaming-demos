/**
 * Mode B — Data flow. Claude Agent SDK with the single mcp-alien HTTP server
 * pointed at the demo's MCP Configuration (cfg_publisher_demo). Admin-trusted:
 * no canUseTool guard, no blocked-tools list — the OAT used here is scoped
 * server-side to exactly the tools the configuration grants.
 *
 * Stripped from openaire's agent-query: no GitHub marketplace discovery, no
 * viz-mcp stdio server, no blocked-tools enforcement.
 */

import { type McpServerConfig, query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import { env } from "../env"
import { getSystemPrompt, type SystemPromptContext } from "./system-prompt"

type ChatMessage = { role: "user" | "assistant"; content: string }

export async function startQuery(
  messages: ChatMessage[],
  model: string,
  configSlug: string,
  promptContext?: SystemPromptContext,
  resumeSessionId?: string | null,
) {
  const systemPrompt = getSystemPrompt(promptContext)
  const mcpUrl = `${env.MCP_ALIEN_URL.replace(/\/$/, "")}/mcp?config=${configSlug}`

  const mcpServers: Record<string, McpServerConfig> = {
    alien: {
      type: "http",
      url: mcpUrl,
      headers: {
        Authorization: `Bearer ${env.ADMIN_OAT}`,
        // Pin every MCP call to the demo's organization so the OAT user's
        // other org memberships can't surface a different tool set.
        "x-organization-id": env.ORG_ID,
      },
    } as McpServerConfig,
  }

  // Block the SDK's built-in tools so the agent can't escape the MCP surface.
  // ToolSearch in particular masks MCP tools — when present, the model calls
  // ToolSearch to "discover" tools rather than dispatching the mcp__alien__*
  // tools directly. With it blocked, the MCP tool list is presented inline
  // and the model uses them straight away.
  const BLOCKED_TOOLS = [
    "Bash", "Read", "Write", "Edit", "Glob", "Grep",
    "WebFetch", "WebSearch", "ToolSearch", "NotebookEdit",
  ]

  const queryOptions: Record<string, unknown> = {
    model,
    systemPrompt,
    mcpServers,
    // Built-ins restricted to nothing — only mcp__alien__* tools are usable.
    tools: [],
    disallowedTools: BLOCKED_TOOLS,
    allowedTools: ["mcp__alien__*"],
    permissionMode: "acceptEdits",
    persistSession: true,
  }
  if (resumeSessionId) queryOptions.resume = resumeSessionId

  async function* createPrompt(): AsyncGenerator<SDKUserMessage> {
    const userMsgs = messages.filter((m) => m.role === "user" && m.content)
    if (userMsgs.length === 0) return
    const latest = userMsgs[userMsgs.length - 1]
    yield {
      type: "user",
      message: { role: "user", content: latest.content },
      parent_tool_use_id: null,
      session_id: crypto.randomUUID(),
    } as SDKUserMessage
  }

  return query({ prompt: createPrompt(), options: queryOptions })
}

/**
 * Drive a query through the SDK and write events into the job store.
 * The frontend polls /api/demo/status/[jobId] for the resulting snapshots.
 */
export async function processQuery(
  jobId: string,
  messages: ChatMessage[],
  model: string,
  configSlug: string,
  promptContext?: SystemPromptContext,
): Promise<void> {
  const { jobStore } = await import("./job-store")
  const startedAt = Date.now()
  jobStore.setStatus(jobId, "running")

  try {
    const iter = await startQuery(messages, model, configSlug, promptContext)
    for await (const msg of iter as AsyncIterable<Record<string, unknown>>) {
      if (jobStore.isCancelled(jobId)) break

      const type = msg.type as string
      if (type === "system" && msg.subtype === "init") {
        const sessionId = msg.session_id as string | undefined
        if (sessionId) jobStore.setSessionId(jobId, sessionId)
        continue
      }
      if (type === "assistant") {
        const m = (msg.message as Record<string, unknown>) ?? {}
        const blocks = (m.content as Array<Record<string, unknown>>) ?? []
        for (const block of blocks) {
          if (block.type === "tool_use") {
            jobStore.addToolActivity(jobId, {
              toolName: String(block.name ?? "unknown"),
              toolUseId: block.id as string | undefined,
              startedAt: Date.now(),
              status: "running",
              input: block.input as Record<string, unknown> | undefined,
            })
          } else if (block.type === "text") {
            const text = String(block.text ?? "")
            if (text) jobStore.addMessage(jobId, { type: "assistant-text", content: text })
          }
        }
        continue
      }
      if (type === "user") {
        const m = (msg.message as Record<string, unknown>) ?? {}
        const blocks = (m.content as Array<Record<string, unknown>>) ?? []
        for (const block of blocks) {
          if (block.type === "tool_result") {
            const content = block.content
            const snippet =
              typeof content === "string"
                ? content.slice(0, 280)
                : JSON.stringify(content).slice(0, 280)
            const toolUseId = block.tool_use_id as string | undefined
            const activity = jobStore
              .get(jobId)
              ?.toolActivity.find((a) => a.toolUseId === toolUseId)
            const toolName = activity?.toolName ?? "unknown"
            jobStore.updateToolActivity(jobId, toolName, {
              completedAt: Date.now(),
              status: block.is_error ? "error" : "completed",
              outputSnippet: snippet,
            })
          }
        }
        continue
      }
      if (type === "result") {
        const text = (msg.result as string) || ""
        jobStore.addMessage(jobId, {
          type: "complete",
          content: text,
          usage: msg.usage,
          timestamp: Date.now(),
        })
      }
    }

    jobStore.setStatus(jobId, jobStore.isCancelled(jobId) ? "error" : "complete")
  } catch (err) {
    console.error("[mode-b] query failed:", err)
    jobStore.setError(jobId, err instanceof Error ? err.message : String(err))
  } finally {
    const job = jobStore.get(jobId)
    if (job) job.metrics.elapsedMs = Date.now() - startedAt
  }
}
