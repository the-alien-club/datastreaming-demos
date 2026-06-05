import { DEFAULT_MCP_TRANSPORT, DATACLUSTER_MCP_ID } from "@/lib/constants"

export interface McpConfig {
  id: string
  serverUrl: string
  authToken: string | null
}

export interface StepConfig {
  name: string
  prompt: string
}

export interface SubagentConfig {
  name: string
  description: string
  systemPrompt: string
  model: string
  mcpIds: string[]
}

export interface AgentConfig {
  name: string
  systemPrompt: string
  steps: StepConfig[]
  model: string
  subagents: SubagentConfig[]
}

// ─── Slug helpers ─────────────────────────────────────────────────────────────

/**
 * Slugify a free-form name into something safe for a workflow node id and for
 * the DeepAgent compiler to surface as the subagent's `task()` tool name.
 *
 * Rules:
 *   - lowercase
 *   - strip accents (NFKD + combining-mark removal)
 *   - collapse any run of non-alphanumeric chars to a single `-`
 *   - trim leading / trailing `-`
 *   - cap at 40 chars (then trim trailing `-` again in case the cap landed
 *     mid-separator)
 *   - if the result is empty (name was e.g. "###" or all-whitespace), return
 *     the supplied `fallback`
 *
 * The output character set `[a-z0-9-]` is the lowest-common-denominator across
 * the consumers we care about: the OpenAI Responses-API `item.id` regex
 * (`agent:[^:]+::…`) accepts anything but `:`, the LangChain DeepAgents
 * `task()` tool name is a free-form string, and React Flow node ids are
 * opaque strings.
 */
function slugify(name: string, fallback: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "")
  return slug || fallback
}

/**
 * Return `candidate` if unused, otherwise append `-2`, `-3`, … until unique.
 * Mutates `used` to record the chosen id so subsequent calls keep diverging.
 *
 * Why a Set instead of just appending an incrementing index: subagent names
 * are user-supplied and may collide either with each other ("Research" used
 * twice) or with the fixed skeleton ids ("agentInput" as a subagent name).
 * Tracking everything in one set covers both cases uniformly.
 */
function uniqueId(candidate: string, used: Set<string>): string {
  if (!used.has(candidate)) {
    used.add(candidate)
    return candidate
  }
  let n = 2
  while (used.has(`${candidate}-${n}`)) n++
  const result = `${candidate}-${n}`
  used.add(result)
  return result
}

// ─── Param helpers ────────────────────────────────────────────────────────────

function param(value: unknown, isExpression = false) {
  return { value, isExpression, isAttachedToInputNode: false }
}

function exprParam(value: string, isAttachedToInputNode = false) {
  return { value, isExpression: true, isAttachedToInputNode }
}

// ─── Node builders ────────────────────────────────────────────────────────────

function buildHttpRequestNode() {
  return {
    id: "httpRequest-0",
    type: "http_request",
    data: {
      label: "HTTP Request",
      handles: ["outputs"],
      isInput: true,
      isOutput: false,
      isTool: false,
      errors: [],
      inputs: [],
      outputs: [],
      params: {
        user_prompt: param(""),
        session_id: param(""),
      },
      schema: {
        input: {
          type: "object",
          properties: {
            user_prompt: { type: "string" },
            session_id: { type: ["string", "null"], default: null },
          },
          additionalProperties: true,
        },
      },
    },
    position: { x: 0, y: 100 },
  }
}

function buildAgentInputNode() {
  return {
    id: "agentInput-3",
    type: "agent_input",
    data: {
      label: "Agent Input",
      handles: ["outputs"],
      isInput: true,
      isOutput: false,
      isTool: false,
      errors: [],
      inputs: [],
      outputs: [],
      params: {
        user_prompt: exprParam("@httpRequest-0.user_prompt"),
        session_id: exprParam("@httpRequest-0.session_id"),
      },
      schema: {
        input: {
          type: "object",
          properties: {
            user_prompt: { type: ["string", "null"], default: null },
            session_id: { type: ["string", "null"], default: null },
          },
          additionalProperties: true,
        },
      },
    },
    position: { x: 100, y: 100 },
  }
}

function buildDeepAgentNode(model: string, assembledSystemPrompt: string) {
  return {
    id: "deepAgent-4",
    type: "deep_agent",
    data: {
      label: "Deep Agent",
      handles: ["inputs", "outputs", "tools", "agents"],
      isInput: false,
      isOutput: false,
      isTool: false,
      errors: [],
      inputs: [],
      outputs: [],
      params: {
        model: param(model),
        system_prompt: param(assembledSystemPrompt),
        messages: exprParam(""),
        streaming: param(true),
        session_id: exprParam("@agentInput-3.session_id", true),
        user_prompt: exprParam("@agentInput-3.user_prompt", true),
        response_format: param({}),
      },
    },
    position: { x: 400, y: 100 },
  }
}

function buildAgentOutputNode() {
  return {
    id: "agentOutput-5",
    type: "agent_output",
    data: {
      label: "Agent Output",
      handles: ["inputs"],
      isInput: false,
      isOutput: true,
      isTool: false,
      errors: [],
      inputs: [],
      outputs: [],
      params: {
        answer: exprParam("@deepAgent-4"),
        session_id: exprParam("@deepAgent-4.sessionId"),
      },
    },
    position: { x: 700, y: 100 },
  }
}

function buildAiAgentNode(innerNodes: unknown[], innerEdges: unknown[]) {
  return {
    id: "aiAgent-1",
    type: "ai_agent",
    data: {
      label: "AI Agent",
      handles: ["inputs", "outputs"],
      isInput: false,
      isOutput: false,
      isTool: false,
      errors: [],
      inputs: [],
      outputs: [],
      params: {},
      workflow: {
        nodes: innerNodes,
        edges: innerEdges,
      },
    },
    position: { x: 300, y: 100 },
  }
}

function buildHttpResponseNode() {
  return {
    id: "httpResponse-2",
    type: "http_response",
    data: {
      label: "HTTP Response",
      handles: ["inputs"],
      isInput: false,
      isOutput: true,
      isTool: false,
      errors: [],
      inputs: [],
      outputs: [],
      params: {
        data: exprParam("@aiAgent-1"),
        session_id: exprParam("@aiAgent-1.session_id"),
      },
    },
    position: { x: 600, y: 100 },
  }
}

function buildSubagentNode(nodeId: string, subagent: SubagentConfig, yOffset: number) {
  return {
    id: nodeId,
    type: "subagent",
    data: {
      label: "Subagent",
      handles: ["agent", "tools"],
      isInput: false,
      isOutput: false,
      isTool: false,
      errors: [],
      inputs: [],
      outputs: [],
      params: {
        model: param(subagent.model),
        system_prompt: param(subagent.systemPrompt),
        description: param(subagent.description),
      },
    },
    position: { x: 400, y: yOffset },
  }
}

function buildMcpServerNode(
  nodeId: string,
  serverUrl: string,
  xOffset: number,
  yOffset: number,
  authToken: string | null = null
) {
  return {
    id: nodeId,
    type: "mcp_server",
    data: {
      label: "MCP Server",
      handles: ["tool"],
      isInput: false,
      isOutput: false,
      isTool: false,
      errors: [],
      inputs: [],
      outputs: [],
      params: {
        server_url: param(serverUrl),
        transport: param(DEFAULT_MCP_TRANSPORT),
        auth_token: param(authToken),
        tool_filter: param(null),
      },
    },
    position: { x: xOffset, y: yOffset },
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function assembleSystemPrompt(
  overallPrompt: string,
  steps: StepConfig[]
): string {
  if (steps.length === 0) return overallPrompt

  const stepsText = steps
    .map((step, idx) => `## Step ${idx + 1}: ${step.name}\n${step.prompt}`)
    .join("\n\n")

  return `${overallPrompt}\n\n# Steps\n\n${stepsText}`
}

export function buildAgentWorkflow(config: AgentConfig, mcpConfigs: McpConfig[]): {
  nodes: unknown[]
  edges: unknown[]
  /** Node IDs in the same order as `config.subagents`. */
  subagentNodeIds: string[]
} {
  const assembledSystemPrompt = assembleSystemPrompt(config.systemPrompt, config.steps)

  // ── Inner graph ────────────────────────────────────────────────────────────
  const innerNodes: unknown[] = [
    buildAgentInputNode(),
    buildDeepAgentNode(config.model, assembledSystemPrompt),
    buildAgentOutputNode(),
  ]

  const innerEdges: unknown[] = [
    {
      id: "e-input-deep",
      source: "agentInput-3",
      target: "deepAgent-4",
      sourceHandle: "outputs",
      targetHandle: "inputs",
    },
    {
      id: "e-deep-output",
      source: "deepAgent-4",
      target: "agentOutput-5",
      sourceHandle: "outputs",
      targetHandle: "inputs",
    },
  ]

  // Subagent / MCP node ids are slugified from the subagent name and the
  // MCP id rather than numeric. This matters because the DeepAgent compiler
  // (workers/nodes/deep_agent/compiler/deep_agent_compiler.py:339) does
  // `name = node_id` for each subagent — the LLM sees this string as the
  // `task()` tool name. Readable names → better dispatch by the main agent.
  //
  // `usedIds` is seeded with the fixed skeleton ids so a subagent unfortunate
  // enough to be named "deepAgent" doesn't clobber the core graph.
  const usedIds = new Set<string>([
    "httpRequest-0",
    "aiAgent-1",
    "httpResponse-2",
    "agentInput-3",
    "deepAgent-4",
    "agentOutput-5",
  ])
  const subagentNodeIds: string[] = []

  config.subagents.forEach((subagent, subIdx) => {
    const subagentNodeId = uniqueId(
      `subagent-${slugify(subagent.name, `${subIdx + 1}`)}`,
      usedIds,
    )
    subagentNodeIds.push(subagentNodeId)

    const subagentYOffset = 300 + subIdx * 200

    innerNodes.push(buildSubagentNode(subagentNodeId, subagent, subagentYOffset))

    // Edge: deepAgent-4 → subagent. Edge id derives from the (unique) target
    // node id so collisions are not possible within a single graph build.
    innerEdges.push({
      id: `e-deep-${subagentNodeId}`,
      source: "deepAgent-4",
      target: subagentNodeId,
      sourceHandle: "agents",
      targetHandle: "agent",
    })

    // Resolve MCP configs and build MCP server nodes
    subagent.mcpIds.forEach((mcpId, mcpIdx) => {
      const mcpConfig = mcpConfigs.find((m) => m.id === mcpId)
      const serverUrl =
        mcpId === DATACLUSTER_MCP_ID && process.env.DATACLUSTER_MCP_URL
          ? process.env.DATACLUSTER_MCP_URL
          : mcpConfig?.serverUrl

      if (!serverUrl) {
        throw new Error(`Unknown MCP ID: ${mcpId}`)
      }

      const authToken = mcpConfig?.authToken ?? null

      const mcpNodeId = uniqueId(
        `mcpServer-${slugify(mcpId, `${mcpIdx + 1}`)}`,
        usedIds,
      )

      innerNodes.push(
        buildMcpServerNode(
          mcpNodeId,
          serverUrl,
          600 + mcpIdx * 200,
          subagentYOffset + 100,
          authToken
        )
      )

      // Edge: subagent → mcpServer. Composite of two already-unique ids.
      innerEdges.push({
        id: `e-${subagentNodeId}-${mcpNodeId}`,
        source: subagentNodeId,
        target: mcpNodeId,
        sourceHandle: "tools",
        targetHandle: "tool",
      })
    })
  })

  // ── Outer graph ────────────────────────────────────────────────────────────
  const outerNodes: unknown[] = [
    buildHttpRequestNode(),
    buildAiAgentNode(innerNodes, innerEdges),
    buildHttpResponseNode(),
  ]

  const outerEdges: unknown[] = [
    {
      id: "e-http-agent",
      source: "httpRequest-0",
      target: "aiAgent-1",
      sourceHandle: "outputs",
      targetHandle: "inputs",
    },
    {
      id: "e-agent-resp",
      source: "aiAgent-1",
      target: "httpResponse-2",
      sourceHandle: "outputs",
      targetHandle: "inputs",
    },
  ]

  return { nodes: outerNodes, edges: outerEdges, subagentNodeIds }
}
