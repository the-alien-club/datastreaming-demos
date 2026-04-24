# LDS Chatbot — Agent Management (Workflow CRUD)

## Concept

An "agent" in this app is a thin local record pointing to a real workflow on the platform backend. When the user creates/edits an agent, we build or modify a workflow graph and push it to the platform via `POST /workflows` or `PATCH`.

## Workflow Graph Template

Every agent follows the same graph pattern:

```
Outer level:
  httpRequest-0 ──flow──> aiAgent-1 ──flow──> httpResponse-2

Inner level (inside aiAgent-1.data.workflow):
  agentInput-3 ──flow──> deepAgent-4 ──flow──> agentOutput-5
                          deepAgent-4 ──agents──> subagent-6 ──tools──> mcpServer-7
                          deepAgent-4 ──agents──> subagent-8 ──tools──> mcpServer-9
                                                                ──tools──> mcpServer-10
```

### Outer Nodes

**httpRequest-0** — The workflow entry point. Accepts `input` from the run call.

```json
{
  "id": "httpRequest-0",
  "type": "httpRequest",
  "data": {
    "label": "HTTP Request",
    "handles": ["inputs", "outputs"],
    "params": {
      "user_prompt": { "value": "", "isExpression": false, "isAttachedToInputNode": false },
      "session_id": { "value": "", "isExpression": false, "isAttachedToInputNode": false },
      "system_prompt": { "value": "<SYSTEM_PROMPT>", "isExpression": false, "isAttachedToInputNode": false },
      "model": { "value": "<MODEL>", "isExpression": false, "isAttachedToInputNode": false }
    },
    "schema": {
      "input": {
        "type": "object",
        "properties": {
          "user_prompt": { "type": "string" },
          "session_id": { "type": ["string", "null"], "default": null },
          "streaming": { "type": "boolean", "default": true }
        },
        "additionalProperties": true
      }
    },
    "isInput": false,
    "isOutput": false,
    "isTool": false,
    "errors": [],
    "inputs": [],
    "outputs": []
  },
  "position": { "x": 0, "y": 100 }
}
```

**aiAgent-1** — Group container holding the inner workflow.

```json
{
  "id": "aiAgent-1",
  "type": "aiAgent",
  "data": {
    "label": "AI Agent",
    "handles": ["inputs", "outputs"],
    "params": {},
    "workflow": {
      "nodes": [ /* agentInput, deepAgent, agentOutput, subagents, mcpServers */ ],
      "edges": [ /* inner edges */ ]
    },
    "isInput": false,
    "isOutput": false,
    "isTool": false,
    "errors": [],
    "inputs": [],
    "outputs": []
  },
  "position": { "x": 300, "y": 100 }
}
```

**httpResponse-2** — The workflow output. Passes through the aiAgent output.

```json
{
  "id": "httpResponse-2",
  "type": "httpResponse",
  "data": {
    "label": "HTTP Response",
    "handles": ["inputs"],
    "params": {
      "data": { "value": "@aiAgent-1", "isExpression": true, "isAttachedToInputNode": false }
    },
    "isInput": false,
    "isOutput": true,
    "isTool": false,
    "errors": [],
    "inputs": [],
    "outputs": []
  },
  "position": { "x": 600, "y": 100 }
}
```

### Inner Nodes (inside aiAgent-1.data.workflow)

**agentInput-3** — Inner entry point.

```json
{
  "id": "agentInput-3",
  "type": "agent_input",
  "data": {
    "label": "Agent Input",
    "handles": ["outputs"],
    "isInput": true,
    "params": {
      "user_prompt": { "value": "", "isExpression": false, "isAttachedToInputNode": false },
      "session_id": { "value": "", "isExpression": false, "isAttachedToInputNode": false }
    },
    "schema": {
      "input": {
        "type": "object",
        "properties": {
          "user_prompt": { "type": ["string", "null"], "default": null },
          "session_id": { "type": ["string", "null"], "default": null }
        },
        "additionalProperties": true
      }
    },
    "errors": [], "inputs": [], "outputs": [], "isTool": false, "isOutput": false
  },
  "position": { "x": 100, "y": 100 }
}
```

**deepAgent-4** — The core agent node.

```json
{
  "id": "deepAgent-4",
  "type": "deep_agent",
  "data": {
    "label": "Deep Agent",
    "handles": ["inputs", "outputs", "tools", "agents"],
    "params": {
      "model": { "value": "<MODEL>", "isExpression": false, "isAttachedToInputNode": false },
      "system_prompt": { "value": "<ASSEMBLED_SYSTEM_PROMPT>", "isExpression": false, "isAttachedToInputNode": false },
      "messages": { "value": "", "isExpression": true, "isAttachedToInputNode": false },
      "streaming": { "value": true, "isExpression": false, "isAttachedToInputNode": false },
      "session_id": { "value": "@agentInput-3.session_id", "isExpression": true, "isAttachedToInputNode": true },
      "user_prompt": { "value": "@agentInput-3.user_prompt", "isExpression": true, "isAttachedToInputNode": true },
      "response_format": { "value": {}, "isExpression": false, "isAttachedToInputNode": false }
    },
    "errors": [], "inputs": [], "outputs": [], "isTool": false, "isInput": false, "isOutput": false
  },
  "position": { "x": 400, "y": 100 }
}
```

**agentOutput-5** — Inner exit point.

```json
{
  "id": "agentOutput-5",
  "type": "agentOutput",
  "data": {
    "label": "Agent Output",
    "handles": ["inputs"],
    "isOutput": true,
    "params": {
      "answer": { "value": "@deepAgent-4", "isExpression": true, "isAttachedToInputNode": false },
      "session_id": { "value": "@deepAgent-4.sessionId", "isExpression": true, "isAttachedToInputNode": false }
    },
    "errors": [], "inputs": [], "outputs": [], "isTool": false, "isInput": false
  },
  "position": { "x": 700, "y": 100 }
}
```

### Subagent + MCP Server Nodes

**subagent** node:

```json
{
  "id": "subagent-6",
  "type": "subagent",
  "data": {
    "label": "Subagent",
    "handles": ["agent", "tools"],
    "params": {
      "model": { "value": "gpt-4o-mini", "isExpression": false, "isAttachedToInputNode": false },
      "system_prompt": { "value": "<SUBAGENT_SYSTEM_PROMPT>", "isExpression": false, "isAttachedToInputNode": false },
      "description": { "value": "<DESCRIPTION_FOR_MAIN_AGENT>", "isExpression": false, "isAttachedToInputNode": false }
    },
    "errors": [], "inputs": [], "outputs": [], "isTool": false, "isInput": false, "isOutput": false
  },
  "position": { "x": 400, "y": 300 }
}
```

**mcp_server** node:

```json
{
  "id": "mcpServer-7",
  "type": "mcp_server",
  "data": {
    "label": "MCP Server",
    "handles": ["tool"],
    "params": {
      "server_url": { "value": "https://mcp.alien.club/datacluster/mcp", "isExpression": false, "isAttachedToInputNode": false },
      "transport": { "value": "streamable_http", "isExpression": false, "isAttachedToInputNode": false },
      "auth_token": { "value": null, "isExpression": false, "isAttachedToInputNode": false },
      "tool_filter": { "value": null, "isExpression": false, "isAttachedToInputNode": false }
    },
    "errors": [], "inputs": [], "outputs": [], "isTool": false, "isInput": false, "isOutput": false
  },
  "position": { "x": 600, "y": 400 }
}
```

Note: `auth_token: null` for `alien.club` URLs — the worker auto-injects the job's user JWT.

### Inner Edges

```json
[
  { "id": "e-input-deep", "source": "agentInput-3", "target": "deepAgent-4", "sourceHandle": "outputs", "targetHandle": "inputs" },
  { "id": "e-deep-output", "source": "deepAgent-4", "target": "agentOutput-5", "sourceHandle": "outputs", "targetHandle": "inputs" },
  { "id": "e-deep-sub6", "source": "deepAgent-4", "target": "subagent-6", "sourceHandle": "agents", "targetHandle": "agent" },
  { "id": "e-sub6-mcp7", "source": "subagent-6", "target": "mcpServer-7", "sourceHandle": "tools", "targetHandle": "tool" }
]
```

### Outer Edges

```json
[
  { "id": "e-http-agent", "source": "httpRequest-0", "target": "aiAgent-1", "sourceHandle": "outputs", "targetHandle": "inputs" },
  { "id": "e-agent-resp", "source": "aiAgent-1", "target": "httpResponse-2", "sourceHandle": "outputs", "targetHandle": "inputs" }
]
```

## System Prompt Assembly

The deep agent's `system_prompt` is assembled from:

1. **Overall system prompt** — free-form text from the user
2. **Steps** — named sections, each with its own prompt text

Assembly logic (in `lib/platform/workflows.ts`):

```typescript
function assembleSystemPrompt(overallPrompt: string, steps: { name: string; prompt: string }[]): string {
  if (steps.length === 0) return overallPrompt

  const stepsSections = steps
    .map((step, i) => `## Step ${i + 1}: ${step.name}\n\n${step.prompt}`)
    .join("\n\n---\n\n")

  return `${overallPrompt}\n\n# Workflow Steps\n\n${stepsSections}`
}
```

## Workflow Graph Builder

File: `lib/platform/workflows.ts`

The graph builder provides functions to:

1. **`buildAgentWorkflow(config)`** — Build the complete workflow graph from agent config
2. **`addSubagent(workflow, subagentConfig)`** — Add a subagent node + edges + MCP server nodes
3. **`removeSubagent(workflow, subagentNodeId)`** — Remove a subagent and its connected MCP servers
4. **`updateDeepAgentPrompt(workflow, systemPrompt)`** — Update the system prompt on the deep agent node

### Node ID Generation

Use an incrementing counter starting from the highest existing ID:
- Outer nodes: `httpRequest-0`, `aiAgent-1`, `httpResponse-2`
- Inner nodes: `agentInput-3`, `deepAgent-4`, `agentOutput-5`
- Dynamic nodes: `subagent-6`, `mcpServer-7`, `subagent-8`, `mcpServer-9`, etc.

The counter is tracked per workflow to avoid ID collisions when adding/removing subagents.

## API Calls

### Create Agent

1. Build workflow graph from agent config
2. `POST /workflows` with:
   ```json
   {
     "name": "LDS Agent: <agent_name>",
     "slug": "lds-agent-<uuid>",
     "description": "<agent_description>",
     "isPublic": false,
     "type": "streaming",
     "nodes": [...outerNodes],
     "edges": [...outerEdges]
   }
   ```
3. Save to local DB: `{ id: uuid, workflow_id: response.data.id, name, description, ... }`

### Update Agent

1. Read current workflow from local agent record
2. Rebuild the workflow graph with updated config
3. `POST /workflows` — create a new workflow (or PUT to update if the API supports it)
4. Update local DB with new `workflow_id` if needed

### Delete Agent

1. Delete from local DB
2. Optionally delete the workflow on the backend (if we have a DELETE endpoint)

## MCP Configuration File

File: `lib/mcps/config.json`

Static list of available MCP servers that users can attach to subagents:

```json
[
  {
    "id": "datacluster",
    "name": "Data Cluster",
    "description": "Search and retrieve documents from data cluster datasets. Includes keyword search, vector search, and entry retrieval.",
    "server_url": "https://mcp.alien.club/datacluster/mcp",
    "transport": "streamable_http",
    "icon": "database",
    "category": "data"
  },
  {
    "id": "biorxiv",
    "name": "BioRxiv",
    "description": "Search and read biomedical preprints from BioRxiv and MedRxiv.",
    "server_url": "https://mcp.alien.club/biorxiv/mcp",
    "transport": "streamable_http",
    "icon": "flask",
    "category": "research"
  },
  {
    "id": "openaire",
    "name": "OpenAIRE",
    "description": "Access 600M+ research products. Author profiles, citation networks, project funding, and bibliometric analysis.",
    "server_url": "https://mcp.alien.club/openaire/mcp",
    "transport": "streamable_http",
    "icon": "globe",
    "category": "research"
  }
]
```

This file is loaded at build time. Users select MCPs from this list when creating subagents. Each selected MCP becomes an `mcp_server` node connected to the subagent.

## Agent Editor UI

### Layout

```
┌──────────────────────────────────────────────────────┐
│  Agent: My Legal Assistant                    [Save] │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Model: [gpt-4o-mini ▾]                             │
│                                                      │
│  System Prompt:                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │ You are a legal research assistant...        │    │
│  │                                              │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  Steps:                                    [+ Add]   │
│  ┌──────────────────────────────────────────────┐    │
│  │ Step 1: Company Identification        [Edit] │    │
│  │ Step 2: Position Qualification        [Edit] │    │
│  │ Step 3: Candidate Information         [Edit] │    │
│  │ Step 4: Document Generation           [Edit] │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  Specialist Agents:                        [+ Add]   │
│  ┌──────────────────────────────────────────────┐    │
│  │ 🔍 Legal Researcher                          │    │
│  │   Model: mistral-large-2512                  │    │
│  │   MCPs: OpenAIRE, Data Cluster               │    │
│  │                              [Edit] [Remove] │    │
│  ├──────────────────────────────────────────────┤    │
│  │ 📚 Corpus: SYNTEC Convention                  │    │
│  │   Dataset: dataset-42                        │    │
│  │   MCPs: Data Cluster (filtered)              │    │
│  │                              [Edit] [Remove] │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  [Chat with Agent]  [View Conversations]             │
└──────────────────────────────────────────────────────┘
```

### Add Subagent Dialog

When clicking "+ Add" on specialist agents:

1. **Name** — text input
2. **Description** — what this subagent does (shown to main agent for delegation)
3. **System prompt** — textarea
4. **Model** — dropdown
5. **MCPs** — multi-select from static config, checkboxes
6. **Corpus mode** — toggle. When enabled:
   - Select a dataset from the datasets list
   - Auto-generates a system prompt: "You are a specialist that searches dataset {datasetId}. Use the Data Cluster MCP tools with datasetIds=[{datasetId}] to find relevant information."
   - Auto-selects the Data Cluster MCP

### Add Step Dialog

1. **Name** — text input (e.g., "Company Identification")
2. **Prompt** — textarea with the step instructions
3. Drag to reorder steps
