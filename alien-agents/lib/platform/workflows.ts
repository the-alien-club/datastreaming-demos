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

  // Dynamic subagent nodes start at index 6
  let nextNodeIndex = 6
  const subagentNodeIds: string[] = []

  config.subagents.forEach((subagent, subIdx) => {
    const subagentNodeId = `subagent-${nextNodeIndex}`
    const subagentIdx = nextNodeIndex
    subagentNodeIds.push(subagentNodeId)
    nextNodeIndex++

    const subagentYOffset = 300 + subIdx * 200

    innerNodes.push(buildSubagentNode(subagentNodeId, subagent, subagentYOffset))

    // Edge: deepAgent-4 → subagent
    innerEdges.push({
      id: `e-deep-sub${subagentIdx}`,
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

      const mcpNodeId = `mcpServer-${nextNodeIndex}`
      const mcpIdx_ = nextNodeIndex
      nextNodeIndex++

      innerNodes.push(
        buildMcpServerNode(
          mcpNodeId,
          serverUrl,
          600 + mcpIdx * 200,
          subagentYOffset + 100,
          authToken
        )
      )

      // Edge: subagent → mcpServer
      innerEdges.push({
        id: `e-sub${subagentIdx}-mcp${mcpIdx_}`,
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
