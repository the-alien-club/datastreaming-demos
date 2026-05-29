import { describe, expect, it } from "vitest"
import { buildAgentWorkflow, assembleSystemPrompt, type McpConfig } from "./workflows"

const NO_MCPS: McpConfig[] = []

describe("assembleSystemPrompt", () => {
  it("returns the overall prompt verbatim when no steps", () => {
    expect(assembleSystemPrompt("you are helpful", [])).toBe("you are helpful")
  })

  it("appends a Steps section when steps are present", () => {
    const out = assembleSystemPrompt("you are helpful", [
      { name: "search", prompt: "search the web" },
      { name: "answer", prompt: "give the user an answer" },
    ])
    expect(out).toContain("you are helpful")
    expect(out).toContain("# Steps")
    expect(out).toContain("## Step 1: search")
    expect(out).toContain("search the web")
    expect(out).toContain("## Step 2: answer")
  })
})

// Helper to fish the nested inner graph out of the aiAgent-1 node, where
// `buildAgentWorkflow` parks the deep-agent + subagents subgraph.
function innerGraph(nodes: unknown[]): { nodes: Array<{ id: string }>; edges: Array<{ source: string; target: string }> } {
  const aiAgent = (nodes as Array<{ id: string; data?: { workflow?: unknown } }>).find(
    (n) => n.id === "aiAgent-1",
  )
  const wf = aiAgent?.data?.workflow as
    | { nodes?: Array<{ id: string }>; edges?: Array<{ source: string; target: string }> }
    | undefined
  return { nodes: wf?.nodes ?? [], edges: wf?.edges ?? [] }
}

describe("buildAgentWorkflow", () => {
  it("emits the fixed outer + inner skeleton with zero subagents", () => {
    const { nodes, edges } = buildAgentWorkflow(
      {
        name: "Test",
        systemPrompt: "be helpful",
        steps: [],
        model: "mistral-large-2512",
        subagents: [],
      },
      NO_MCPS,
    )
    // Outer skeleton: httpRequest-0, aiAgent-1, httpResponse-2 (3 nodes,
    // 2 edges). The inner graph (deep agent + subagents + MCPs) lives
    // inside the aiAgent-1 node's `data.workflow` block.
    const outerIds = (nodes as Array<{ id: string }>).map((n) => n.id)
    expect(outerIds).toEqual(["httpRequest-0", "aiAgent-1", "httpResponse-2"])

    const inner = innerGraph(nodes)
    const innerIds = inner.nodes.map((n) => n.id)
    expect(innerIds).toContain("agentInput-3")
    expect(innerIds).toContain("deepAgent-4")
    expect(innerIds).toContain("agentOutput-5")

    // Outer edges reference only outer nodes.
    const edgeArr = edges as Array<{ source: string; target: string }>
    for (const e of edgeArr) {
      expect(outerIds).toContain(e.source)
      expect(outerIds).toContain(e.target)
    }
  })

  it("adds one subagent node + one MCP server node per subagent.mcpId", () => {
    const { nodes } = buildAgentWorkflow(
      {
        name: "Test",
        systemPrompt: "",
        steps: [],
        model: "mistral-large-2512",
        subagents: [
          {
            name: "Researcher",
            description: "",
            systemPrompt: "research",
            model: "mistral-large-2512",
            mcpIds: ["search:user-1"],
          },
        ],
      },
      [
        { id: "search:user-1", serverUrl: "https://example.com/mcp", authToken: null },
      ],
    )
    const innerIds = innerGraph(nodes).nodes.map((n) => n.id)
    expect(innerIds).toContain("subagent-6")
    expect(innerIds).toContain("mcpServer-7")
  })

  it("throws if a subagent references an unknown MCP id and no env override", () => {
    const prevEnv = process.env.DATACLUSTER_MCP_URL
    delete process.env.DATACLUSTER_MCP_URL
    expect(() =>
      buildAgentWorkflow(
        {
          name: "T",
          systemPrompt: "",
          steps: [],
          model: "mistral-large-2512",
          subagents: [
            {
              name: "X",
              description: "",
              systemPrompt: "",
              model: "mistral-large-2512",
              mcpIds: ["does-not-exist"],
            },
          ],
        },
        NO_MCPS,
      ),
    ).toThrow(/Unknown MCP ID/)
    if (prevEnv !== undefined) process.env.DATACLUSTER_MCP_URL = prevEnv
  })

  it('substitutes the DATACLUSTER_MCP_URL env var for mcpId="datacluster"', () => {
    const prev = process.env.DATACLUSTER_MCP_URL
    process.env.DATACLUSTER_MCP_URL = "https://test.cluster.example/mcp"
    try {
      const { nodes } = buildAgentWorkflow(
        {
          name: "T",
          systemPrompt: "",
          steps: [],
          model: "mistral-large-2512",
          subagents: [
            {
              name: "Corpus",
              description: "",
              systemPrompt: "",
              model: "mistral-large-2512",
              mcpIds: ["datacluster"],
            },
          ],
        },
        NO_MCPS,
      )
      const innerIds = innerGraph(nodes).nodes.map((n) => n.id)
      expect(innerIds).toContain("mcpServer-7")
    } finally {
      if (prev === undefined) delete process.env.DATACLUSTER_MCP_URL
      else process.env.DATACLUSTER_MCP_URL = prev
    }
  })
})
