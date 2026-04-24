# LDS Chatbot — Dataset & Corpus Management

## Concept

Users can create datasets, upload documents, monitor pipeline processing, and then attach a processed dataset as a "corpus" to a specialist subagent. The data cluster is accessed through the platform backend proxy using the `@alien/data-api-client` TypeScript SDK.

## Data Cluster Access Pattern

All calls route through the platform backend proxy:

```
Next.js API Route
  → fetch(${PLATFORM_API_URL}/clusters/${CLUSTER_ID}/proxy/api/v1/...)
    → Platform backend proxies to actual data cluster
```

The SDK is configured in `lib/cluster/client.ts`:

```typescript
import { Configuration, DatasetsApi, EntriesApi, PipelinesApi, SearchApi, HealthApi } from "@alien/data-api-client"

export function getClusterClient(accessToken: string) {
  const config = new Configuration({
    basePath: `${process.env.PLATFORM_API_URL}/clusters/${process.env.CLUSTER_ID}/proxy`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  return {
    datasets: new DatasetsApi(config),
    entries: new EntriesApi(config),
    pipelines: new PipelinesApi(config),
    search: new SearchApi(config),
    health: new HealthApi(config),
  }
}
```

## Dataset Creation Flow

### Step 1: Create Dataset

```typescript
const dataset = await client.datasets.createDatasetApiV1DatasetsPost({
  datasetCreateRequest: {
    name: "My Corpus",
    slug: "my-corpus",
    description: "Legal documents for SYNTEC convention",
    datasetType: "text",
    schemaDefinition: {
      schemaId: "default",
      version: "1.0",
      original: { metadataSchema: {} },
      processed: { metadataSchema: {} },
      processing: { metadataSchema: {} },
    },
  },
})
// dataset.id is the cluster dataset ID
```

### Step 2: Configure Pipeline

Use the `applyPreset` shortcut for simplicity:

```typescript
await client.pipelines.applyPresetApiV1PipelinesDatasetsDatasetIdApplyPresetPost({
  datasetId: dataset.id,
  applyPresetRequest: {
    presetName: "general_purpose",
    trigger: "on_upload",
  },
})
```

Or configure manually with the full pipeline config (as in the e2e test):

```typescript
await client.pipelines.configurePipelineApiV1PipelinesDatasetsDatasetIdConfigPatch({
  datasetId: dataset.id,
  datasetPipelineConfigInput: {
    enabled: true,
    trigger: "on_upload",
    timeout: 3600,
    steps: [
      { name: "fetch-entry", component: "fetch-entry-processor-1.0.0", ... },
      { name: "ocr", component: "mistral-ocr-processor-1.0.0", ... },
      // ... full pipeline
    ],
  },
})
```

### Step 3: Upload Documents

Two-step per document:

```typescript
// 1. Create entry record
const entry = await client.entries.createEntryApiV1EntriesPost({
  entryCreateRequest: {
    datasetId: dataset.id,
    name: file.name.replace(/\.[^.]+$/, ""),
    slug: slugify(file.name),
    description: "",
    metadata: {},
  },
})

// 2. Upload file
await client.entries.uploadFileToEntryApiV1EntriesEntryIdUploadPost({
  entryId: entry.entry.id,
  file: file,  // File object from input
})
```

### Step 4: Monitor Pipeline

Poll entry status every 10 seconds:

```typescript
const entry = await client.entries.getEntryApiV1EntriesEntryIdGet({ entryId })
// entry.status: "pending" | "uploading" | "uploaded" | "processing" | "processed" | "error"
```

Pipeline is triggered automatically on upload (when `trigger: "on_upload"`).

## Local Dataset Record

When a dataset is created, we save a pointer locally:

```typescript
await db.insert(datasets).values({
  id: crypto.randomUUID(),
  clusterDatasetId: dataset.id,
  name: "My Corpus",
  description: "Legal documents for SYNTEC convention",
  status: "pending", // updated as entries are processed
  agentId: null, // linked when attached to an agent
})
```

## Creating a Corpus Subagent

When the user wants to attach a dataset as a corpus to an agent:

1. User selects a dataset (must be in `ready` status — all entries processed)
2. System creates a subagent with:
   - **Description**: `"Specialist for searching the '{datasetName}' corpus. Delegates document search and retrieval from dataset {datasetId}."`
   - **System prompt**: Auto-generated:
     ```
     You are a document search specialist for the "{datasetName}" corpus.

     When searching, ALWAYS use datasetIds=[{datasetId}] to restrict searches to this specific corpus.

     Your tools allow you to:
     - Search documents by keyword (keyword_search)
     - Search documents by semantic similarity (vector_search_chunks)
     - Get full document content (get_entry_content)
     - List documents in a dataset (get_entry_documents)

     Always include dataset ID {datasetId} in your search queries.
     Return relevant excerpts with source references (entry IDs and titles).
     ```
   - **MCP**: Data Cluster MCP (`https://mcp.alien.club/datacluster/mcp`)
   - **tool_filter**: Can optionally filter to only `datacluster_*` tools

3. The subagent node and MCP server node are added to the workflow graph
4. Local `datasets` record is linked to the agent: `agentId = agent.id`

## Dataset Management UI

### Dataset List Page (`/datasets`)

```
┌──────────────────────────────────────────────────────┐
│  Datasets                                  [+ New]   │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │ 📄 SYNTEC Convention                          │    │
│  │   12 documents · 11 processed · 1 processing │    │
│  │   Status: Processing...                      │    │
│  │                              [View] [Delete] │    │
│  ├──────────────────────────────────────────────┤    │
│  │ 📄 Legal Templates                            │    │
│  │   5 documents · 5 processed                  │    │
│  │   Status: Ready ✓                            │    │
│  │   Linked to: Legal Assistant                 │    │
│  │                     [View] [Attach] [Delete] │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### New Dataset Page (`/datasets/new`)

Simple wizard:

1. **Name & Description** — text inputs
2. **Upload Documents** — file drop zone (accepts PDF, TXT, DOCX)
3. **Pipeline** — auto-configured with `general_purpose` preset, `on_upload` trigger
4. After creation, redirect to dataset detail page

### Dataset Detail Page (`/datasets/[id]`)

Shows:
- Dataset info (name, description, creation date)
- Entry list with status indicators (pending, uploading, uploaded, processing, processed, error)
- Upload more documents button
- Auto-refresh when entries are in-progress (10s polling)
- "Attach to Agent" button (opens agent selector dialog)

## API Routes

### `POST /api/datasets` — Create Dataset

Server action that:
1. Creates dataset on cluster via SDK
2. Applies `general_purpose` pipeline preset
3. Saves pointer in local DB

### `POST /api/datasets/[id]/entries` — Upload Entry

Server action that:
1. Creates entry record on cluster
2. Uploads file to cluster
3. Returns entry ID for status tracking

### `GET /api/datasets/[id]/entries` — List Entries

Server action that:
1. Lists entries from cluster via SDK
2. Returns with status for polling

### `POST /api/datasets/[id]/attach` — Attach to Agent

Server action that:
1. Creates a corpus subagent on the agent's workflow
2. Links dataset to agent in local DB
3. Returns updated agent config

## Package Dependencies

```json
{
  "@alien/data-api-client": "^1.4.3-dev"
}
```

Requires `.npmrc` for the GitLab package registry:

```
@alien:registry=https://gitlab.com/api/v4/projects/75857874/packages/npm/
//gitlab.com/api/v4/projects/75857874/packages/npm/:_authToken=${GITLAB_TOKEN}
```
