/**
 * Mode B — Data flow. Canonical client-side tool-use loop against the official
 * Anthropic Messages API (no MCP connector beta).
 *
 *   1. Fetch the tool catalog from mcp-alien (`tools/list`) and convert to
 *      Anthropic Tool schemas.
 *   2. Call `client.beta.messages.stream` with those tools.
 *   3. Stream events. When the assistant emits `tool_use` blocks, execute each
 *      via mcp-alien (`tools/call`) and feed `tool_result` content back as a
 *      new `user` turn.
 *   4. Loop until `stop_reason !== "tool_use"`.
 *
 * Why this and not the MCP connector beta:
 *   - 10-iteration hard cap on the connector silently truncates real agent
 *     turns mid-flight, with no `mcp_tool_result` blocks and no `stop_reason`
 *     emitted (we observed this live).
 *   - The connector accepts only a single `authorization_token`; our org-id
 *     pinning header is lost.
 *   - The connector occasionally hangs against our staging MCP with no error
 *     signal in the stream.
 *
 * The client-side loop is the canonical Anthropic tool-use pattern — the same
 * one Claude Code and every production agent framework uses.
 */

import Anthropic from "@anthropic-ai/sdk"
import type {
  BetaMessageParam,
  BetaRawMessageStreamEvent,
  BetaTool,
  BetaToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages"
import { env } from "../env"
import { callMcpTool, listMcpTools } from "../mcp-client"
import { getSystemPrompt, type SystemPromptContext } from "./system-prompt"

const INTERLEAVED_THINKING_HEADER = "interleaved-thinking-2025-05-14"
const MAX_TOOL_TURNS = 12

export type StreamedToolEvent =
  | { type: "thinking-start" }
  | { type: "thinking-delta"; text: string }
  | { type: "thinking-stop" }
  | { type: "text-start" }
  | { type: "text-delta"; text: string }
  | { type: "text-stop" }
  | {
      type: "tool-use-start"
      toolUseId: string
      toolName: string
      serverName: string
    }
  | { type: "tool-use-input-delta"; toolUseId: string; partialJson: string }
  | { type: "tool-use-stop"; toolUseId: string }
  | {
      type: "tool-result"
      toolUseId: string
      isError: boolean
      content: unknown
    }
  | {
      type: "continuation"
      turnIndex: number
    }
  | {
      type: "message-stop"
      stopReason: string | null
      usage: { input_tokens: number; output_tokens: number } | null
    }
  | { type: "error"; message: string }

export interface ChatTurn {
  role: "user" | "assistant"
  content: string
}

interface TurnOutcome {
  /** Full assistant content block list, ready to append as a tool-loop turn. */
  assistantContent: BetaMessageParam["content"]
  stopReason: string | null
  usage: { input_tokens: number; output_tokens: number } | null
  /** Tool calls extracted in order so the outer loop can execute them. */
  pendingToolCalls: Array<{
    toolUseId: string
    toolName: string
    input: Record<string, unknown>
  }>
}

export async function* streamModeB(
  messages: ChatTurn[],
  model: string,
  configSlug: string,
  promptContext: SystemPromptContext,
  abortSignal: AbortSignal,
): AsyncGenerator<StreamedToolEvent, void, void> {
  const t0 = Date.now()
  const ms = (start: number) => `${Date.now() - start}ms`
  console.log(`[mode-b ▶] start model=${model} slug=${configSlug}`)

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const systemPrompt = getSystemPrompt(promptContext)

  // 1. Discover tools from the MCP server. The list is fixed per configSlug —
  //    we fetch once and reuse across the tool-loop turns.
  let tools: BetaTool[]
  const tListStart = Date.now()
  try {
    const mcpTools = await listMcpTools(configSlug, abortSignal)
    tools = mcpTools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as BetaTool["input_schema"],
    }))
    console.log(`[mode-b ⏱ ] tools/list ${ms(tListStart)} (${tools.length} tools)`)
  } catch (err) {
    yield {
      type: "error",
      message: `Failed to load tools from MCP: ${err instanceof Error ? err.message : String(err)}`,
    }
    return
  }

  // 2. Build initial message list from the chat history.
  let apiMessages: BetaMessageParam[] = messages
    .filter((m) => m.content)
    .map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }))

  let lastOutcome: TurnOutcome | null = null

  for (let turnIdx = 0; turnIdx <= MAX_TOOL_TURNS; turnIdx++) {
    if (turnIdx > 0) {
      console.log(`[mode-b] tool-loop continuation turn=${turnIdx}`)
      yield { type: "continuation", turnIndex: turnIdx }
    }

    const tTurnStart = Date.now()
    const outcome = yield* runOneTurn({
      client,
      model,
      systemPrompt,
      apiMessages,
      tools,
      abortSignal,
    })
    console.log(
      `[mode-b ⏱ ] turn ${turnIdx} api ${ms(tTurnStart)} stop=${outcome.stopReason} toolCalls=${outcome.pendingToolCalls.length}`,
    )
    lastOutcome = outcome

    // Done when the model is finished using tools — emit the final stop.
    if (outcome.stopReason !== "tool_use" || outcome.pendingToolCalls.length === 0) {
      break
    }

    if (turnIdx === MAX_TOOL_TURNS) {
      console.warn(`[mode-b] hit MAX_TOOL_TURNS (${MAX_TOOL_TURNS}) — giving up`)
      break
    }

    // 3. Execute each tool_use the assistant just emitted, and prepare a
    //    single user message containing all tool_result blocks (Anthropic
    //    requires the results in the SAME user turn).
    const toolResultBlocks: BetaToolResultBlockParam[] = []
    for (const call of outcome.pendingToolCalls) {
      if (abortSignal.aborted) return
      const tToolStart = Date.now()
      const result = await callMcpTool(
        configSlug,
        call.toolName,
        call.input,
        abortSignal,
      )
      console.log(
        `[mode-b ⏱ ] tool ${call.toolName} ${ms(tToolStart)} err=${result.isError}`,
      )
      // Emit a UI event so the chat message updates the tool result snippet.
      yield {
        type: "tool-result",
        toolUseId: call.toolUseId,
        isError: result.isError,
        content: result.content,
      }
      toolResultBlocks.push({
        type: "tool_result",
        tool_use_id: call.toolUseId,
        is_error: result.isError,
        // Anthropic accepts `content` as a string or as an array of text/image
        // blocks. We coerce to a string for maximum compatibility.
        content: contentToString(result.content),
      })
    }

    apiMessages = [
      ...apiMessages,
      { role: "assistant", content: outcome.assistantContent },
      { role: "user", content: toolResultBlocks },
    ]
  }

  console.log(
    `[mode-b ■] done total ${ms(t0)} stop=${lastOutcome?.stopReason ?? "?"} in=${lastOutcome?.usage?.input_tokens ?? 0}tok out=${lastOutcome?.usage?.output_tokens ?? 0}tok`,
  )

  yield {
    type: "message-stop",
    stopReason: lastOutcome?.stopReason ?? null,
    usage: lastOutcome?.usage ?? null,
  }
}

function contentToString(content: unknown): string {
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (b && typeof b === "object" && "text" in b) {
          return String((b as { text: unknown }).text ?? "")
        }
        return JSON.stringify(b)
      })
      .join("\n")
  }
  if (typeof content === "string") return content
  return JSON.stringify(content)
}

async function* runOneTurn(args: {
  client: Anthropic
  model: string
  systemPrompt: string
  apiMessages: BetaMessageParam[]
  tools: BetaTool[]
  abortSignal: AbortSignal
}): AsyncGenerator<StreamedToolEvent, TurnOutcome, void> {
  const { client, model, systemPrompt, apiMessages, tools, abortSignal } = args

  let stream: AsyncIterable<BetaRawMessageStreamEvent>
  try {
    stream = client.beta.messages.stream(
      {
        model,
        max_tokens: 16_000,
        system: systemPrompt,
        messages: apiMessages,
        tools,
        // High effort makes adaptive thinking emit summarised reasoning more
        // consistently — at medium effort the model often returns thinking
        // blocks with only a signature and no `thinking_delta` events.
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
      },
      {
        headers: {
          "anthropic-beta": INTERLEAVED_THINKING_HEADER,
        },
        signal: abortSignal,
      },
    )
  } catch (err) {
    yield { type: "error", message: err instanceof Error ? err.message : String(err) }
    return {
      assistantContent: [],
      stopReason: null,
      usage: null,
      pendingToolCalls: [],
    }
  }

  type BlockState =
    | { kind: "thinking"; text: string; signature: string }
    | { kind: "text"; text: string }
    | { kind: "tool_use"; toolUseId: string; toolName: string; inputJson: string }

  const blocks = new Map<number, BlockState>()
  const collectedBlocks: BetaMessageParam["content"] = []
  const pendingToolCalls: TurnOutcome["pendingToolCalls"] = []
  let endStopReason: string | null = null
  let endUsage: { input_tokens: number; output_tokens: number } | null = null

  const finalizeBlock = (idx: number): void => {
    const meta = blocks.get(idx)
    if (!meta) return
    if (meta.kind === "text") {
      ;(collectedBlocks as unknown as Array<Record<string, unknown>>).push({
        type: "text",
        text: meta.text,
      })
    } else if (meta.kind === "thinking") {
      ;(collectedBlocks as unknown as Array<Record<string, unknown>>).push({
        type: "thinking",
        thinking: meta.text,
        signature: meta.signature,
      })
    } else if (meta.kind === "tool_use") {
      let input: Record<string, unknown> = {}
      if (meta.inputJson) {
        try {
          input = JSON.parse(meta.inputJson) as Record<string, unknown>
        } catch {
          /* leave empty — schema-validating model normally wins */
        }
      }
      ;(collectedBlocks as unknown as Array<Record<string, unknown>>).push({
        type: "tool_use",
        id: meta.toolUseId,
        name: meta.toolName,
        input,
      })
      pendingToolCalls.push({
        toolUseId: meta.toolUseId,
        toolName: meta.toolName,
        input,
      })
    }
  }

  const tCallStart = Date.now()
  let tFirstByte = 0
  let tFirstText = 0
  try {
    for await (const event of stream) {
      if (abortSignal.aborted) {
        return {
          assistantContent: collectedBlocks,
          stopReason: endStopReason,
          usage: endUsage,
          pendingToolCalls,
        }
      }
      if (!tFirstByte) {
        tFirstByte = Date.now()
        console.log(`[mode-b ⏱ ]   ttfb ${tFirstByte - tCallStart}ms`)
      }
      if (
        !tFirstText &&
        event.type === "content_block_delta" &&
        (event.delta as unknown as { type?: string }).type === "text_delta"
      ) {
        tFirstText = Date.now()
        console.log(`[mode-b ⏱ ]   ttft ${tFirstText - tCallStart}ms (first text_delta)`)
      }
      logSdkEvent(event)

      switch (event.type) {
        case "content_block_start": {
          const block = event.content_block
          const idx = event.index
          switch (block.type) {
            case "thinking":
              blocks.set(idx, { kind: "thinking", text: "", signature: "" })
              yield { type: "thinking-start" }
              break
            case "text":
              blocks.set(idx, { kind: "text", text: "" })
              yield { type: "text-start" }
              break
            case "tool_use": {
              blocks.set(idx, {
                kind: "tool_use",
                toolUseId: block.id,
                toolName: block.name,
                inputJson: "",
              })
              yield {
                type: "tool-use-start",
                toolUseId: block.id,
                toolName: block.name,
                serverName: "alien",
              }
              break
            }
            default:
              break
          }
          break
        }

        case "content_block_delta": {
          const idx = event.index
          const meta = blocks.get(idx)
          if (!meta) break
          const delta = event.delta
          if (delta.type === "thinking_delta" && meta.kind === "thinking") {
            meta.text += delta.thinking
            yield { type: "thinking-delta", text: delta.thinking }
          } else if (delta.type === "signature_delta" && meta.kind === "thinking") {
            meta.signature += (delta as { signature: string }).signature
          } else if (delta.type === "text_delta" && meta.kind === "text") {
            meta.text += delta.text
            yield { type: "text-delta", text: delta.text }
          } else if (delta.type === "input_json_delta" && meta.kind === "tool_use") {
            meta.inputJson += delta.partial_json
            yield {
              type: "tool-use-input-delta",
              toolUseId: meta.toolUseId,
              partialJson: delta.partial_json,
            }
          }
          break
        }

        case "content_block_stop": {
          const meta = blocks.get(event.index)
          if (!meta) break
          if (meta.kind === "thinking") yield { type: "thinking-stop" }
          else if (meta.kind === "text") yield { type: "text-stop" }
          else if (meta.kind === "tool_use") {
            yield { type: "tool-use-stop", toolUseId: meta.toolUseId }
          }
          finalizeBlock(event.index)
          blocks.delete(event.index)
          break
        }

        case "message_delta": {
          endStopReason = event.delta.stop_reason ?? null
          endUsage = event.usage
            ? {
                input_tokens: event.usage.input_tokens ?? 0,
                output_tokens: event.usage.output_tokens ?? 0,
              }
            : null
          break
        }

        case "message_stop":
          break

        default:
          break
      }
    }
  } catch (err) {
    if (!abortSignal.aborted) {
      yield { type: "error", message: err instanceof Error ? err.message : String(err) }
    }
  }

  return {
    assistantContent: collectedBlocks,
    stopReason: endStopReason,
    usage: endUsage,
    pendingToolCalls,
  }
}

function logSdkEvent(event: BetaRawMessageStreamEvent): void {
  const tag = event.type
  if (event.type === "content_block_start") {
    const block = event.content_block as unknown as Record<string, unknown>
    const detail =
      block.type === "tool_use"
        ? `name=${String(block.name)} id=${String(block.id)}`
        : ""
    console.log(`[mode-b sdk] ${tag} idx=${event.index} blockType=${String(block.type)} ${detail}`)
  } else if (event.type === "content_block_delta") {
    const d = event.delta as unknown as Record<string, unknown>
    console.log(`[mode-b sdk] ${tag} idx=${event.index} deltaType=${String(d.type)}`)
  } else if (event.type === "content_block_stop") {
    console.log(`[mode-b sdk] ${tag} idx=${event.index}`)
  } else if (event.type === "message_delta") {
    const d = event.delta as unknown as Record<string, unknown>
    console.log(
      `[mode-b sdk] ${tag} stop_reason=${String(d.stop_reason)} usage_in=${String(event.usage?.input_tokens)} usage_out=${String(event.usage?.output_tokens)}`,
    )
  } else {
    console.log(`[mode-b sdk] ${tag}`)
  }
}
