/**
 * Seed data — datasources, APIs, attribution, feed, pre-seeded messages,
 * and the deterministic scripted run used until real backend wiring lands.
 */

export type DatasourceChild = {
  id: string
  name: string
  docs: string
  status: "indexed" | "syncing"
  checked: boolean
}

export type Datasource = {
  id: string
  name: string
  sov: "public" | "private"
  datasets?: number
  open?: boolean
  more?: string
  children?: DatasourceChild[]
  docs?: string
  status?: "indexed" | "syncing"
  checked?: boolean
  leaf?: boolean
  priv?: string
}

export type ApiConnector = {
  id: string
  name: string
  auth: string
  last: string
  endpoints: number
  checked: boolean
  idle?: boolean
  spark: number[]
}

export type AttributionEntry = { key: string; name: string; weight: number }

export type FeedEntry = {
  uid?: number
  t: string
  tool: string
  meta: string
  fresh?: boolean
}

export type ToolEntry = {
  icon: string
  name: string
  summary: string
  args: string
  result: string
}

export type ScopeMessage = { uid?: number; role: "scope"; text: string }
export type UserMessage = { uid?: number; role: "user"; text: string }
export type AgentMessage = {
  uid?: number
  role: "agent"
  sender?: string
  tools?: ToolEntry[]
  text?: string
  chain?: { who: string; text: string }[]
  faded?: boolean
  streaming?: boolean
  fresh?: boolean
}

export type Message = UserMessage | AgentMessage | ScopeMessage

export const DATASOURCES: Datasource[] = [
  {
    id: "biorxiv",
    name: "bioRxiv",
    sov: "public",
    datasets: 52,
    open: true,
    more: "+47 more datasets",
    children: [
      {
        id: "bx-neuro",
        name: "Neuroscience preprints",
        docs: "12,847",
        status: "indexed",
        checked: true,
      },
      {
        id: "bx-genom",
        name: "Genomics preprints",
        docs: "8,201",
        status: "indexed",
        checked: false,
      },
      {
        id: "bx-cell",
        name: "Cell biology preprints",
        docs: "9,540",
        status: "indexed",
        checked: false,
      },
      {
        id: "bx-bioinfo",
        name: "Bioinformatics preprints",
        docs: "7,330",
        status: "indexed",
        checked: false,
      },
      {
        id: "bx-immuno",
        name: "Immunology preprints",
        docs: "6,118",
        status: "indexed",
        checked: false,
      },
    ],
  },
  {
    id: "pmc",
    name: "PubMed Central",
    sov: "public",
    datasets: 31,
    open: false,
    more: "+28 more datasets",
    children: [
      {
        id: "pmc-oa",
        name: "Open-access subset",
        docs: "41,302",
        status: "indexed",
        checked: false,
      },
      {
        id: "pmc-ct",
        name: "Clinical trials abstracts",
        docs: "6,710",
        status: "syncing",
        checked: false,
      },
      { id: "pmc-rev", name: "Review articles", docs: "18,440", status: "indexed", checked: false },
    ],
  },
  {
    id: "notes",
    name: "Internal clinical notes",
    sov: "private",
    docs: "2,118",
    status: "indexed",
    checked: true,
    leaf: true,
    priv: "Access granted · publisher-cluster",
  },
]

export const APIS: ApiConnector[] = [
  {
    id: "crossref",
    name: "Crossref Search",
    auth: "OAuth",
    last: "2s ago",
    endpoints: 14,
    checked: true,
    spark: [1, 3, 5, 2, 7, 6],
  },
  {
    id: "s2",
    name: "Semantic Scholar",
    auth: "API key",
    last: "14s ago",
    endpoints: 9,
    checked: true,
    spark: [1, 2, 1, 1, 3, 2],
  },
  {
    id: "orcid",
    name: "ORCID lookup",
    auth: "OAuth",
    last: "1m ago",
    endpoints: 5,
    checked: true,
    spark: [1, 1, 2, 1, 1, 1],
  },
  {
    id: "crm",
    name: "Publisher CRM (proxied)",
    auth: "mTLS",
    last: "idle",
    endpoints: 7,
    checked: true,
    idle: true,
    spark: [0, 0, 0, 0, 0, 0],
  },
]

export const ATTRIBUTION: AttributionEntry[] = [
  { key: "bx-neuro", name: "bioRxiv/Neuroscience", weight: 62 },
  { key: "notes", name: "Internal clinical notes", weight: 24 },
  { key: "crossref", name: "Crossref Search", weight: 9 },
  { key: "s2", name: "Semantic Scholar", weight: 5 },
]

export const FEED: FeedEntry[] = [
  {
    t: "14:03:22",
    tool: 'datacluster_keyword_search("dopamine receptors", k=8)',
    meta: "8 hits · 1,240 tok · €0.0042 · bioRxiv/Neuroscience",
  },
  {
    t: "14:03:19",
    tool: 'crossref_search_works(doi="10.1101/2024.11…")',
    meta: "1 hit · 320 tok · €0.0008 · Crossref Search",
  },
  {
    t: "14:03:14",
    tool: 'datacluster_get_entry_content(id="bx-7714")',
    meta: "1 doc · 4,820 tok · €0.0163 · Internal clinical notes",
  },
  {
    t: "14:03:08",
    tool: 'semantic_scholar_paper_lookup(id="s2-0194")',
    meta: "6 hits · 980 tok · €0.0031 · Semantic Scholar",
  },
  {
    t: "14:02:51",
    tool: 'datacluster_vector_search_chunks("D2 antagonist")',
    meta: "5 hits · 1,510 tok · €0.0051 · bioRxiv/Neuroscience",
  },
]

export const MESSAGES: Message[] = [
  {
    role: "user",
    text: "Find recent neuroscience preprints on dopamine receptors and cross-reference with my internal clinical notes.",
  },
  {
    role: "agent",
    tools: [
      {
        icon: "search",
        name: "datacluster_keyword_search",
        summary: '"dopamine receptors", k=8 · 8 results · bioRxiv/Neuroscience',
        args: '{\n  "query": "dopamine receptors",\n  "datasets": ["bioRxiv/Neuroscience"],\n  "k": 8,\n  "since": "2024-09-01"\n}',
        result:
          "8 results · top score 0.91\n[1] D2 receptor antagonism modulates…  (bx-7714)\n[2] Striatal dopamine release dynamics…  (bx-7691)\n[3] Presynaptic D3 autoreceptor control…  (bx-7650)\n… 5 more",
      },
      {
        icon: "file",
        name: "datacluster_get_entry_content",
        summary: 'id="bx-7714" · 1 doc · Internal clinical notes',
        args: '{\n  "id": "bx-7714",\n  "join": "internal/clinical-notes",\n  "fields": ["abstract", "cohort", "outcomes"]\n}',
        result:
          "1 doc · 4,820 tokens · private cluster\nMatched 3 case records on D2 antagonist\nexposure. Cohort n=41, mean age 47.\nRetrieved in-place — content never left\npublisher-cluster.",
      },
    ],
    text: "I found 8 preprints on D2 receptor antagonists from bioRxiv (last 90 days) and 3 matching cases in your internal clinical notes. The strongest overlap is with bx-7714, where the antagonist exposure profile mirrors the cohort you flagged — both show a reduction in phasic striatal signalling that…",
    faded: true,
  },
]

export const SUGGESTIONS: Record<"dataflow" | "agentic", string[]> = {
  dataflow: [
    "Summarize today's bioRxiv neuroscience activity",
    "Cross-reference with my clinical notes",
    "Draft a literature review with citations",
  ],
  agentic: [
    "Plan a systematic review of D2 antagonist trials",
    "Reconcile preprint claims against my clinical cohort",
    "Build an evidence table with citations and gaps",
  ],
}

export const EMPTY_STATE: Record<"dataflow" | "agentic", string> = {
  dataflow:
    "Fresh chat on the same MCP Configuration. Ask anything — every read is metered and attributed.",
  agentic:
    "Fresh workflow on the same MCP Configuration. Give the planner a multi-step task to orchestrate.",
}

export type ScriptedTool = {
  icon: string
  name: string
  type: "dataset" | "api"
  sourceKey: string
  dsRow?: string
  apiRow?: string
  node: string
  summary: string
  args: string
  result: string
  t: string
  feedTool: string
  feedMeta: string
  hits: number
  tokens: number
  royalty: number
}

export type ScriptedRun = {
  query: string
  tools: ScriptedTool[]
  chain: { who: string; text: string }[]
  answer: string
}

export function buildRun(query: string): ScriptedRun {
  return {
    query,
    tools: [
      {
        icon: "search",
        name: "datacluster_keyword_search",
        type: "dataset",
        sourceKey: "bx-neuro",
        dsRow: "bx-neuro",
        node: "specialist",
        summary: '"dopamine receptors", k=8 · 8 results · bioRxiv/Neuroscience',
        args: '{\n  "query": "dopamine receptors",\n  "datasets": ["bioRxiv/Neuroscience"],\n  "k": 8\n}',
        result:
          "8 results · top score 0.91\n[1] D2 receptor antagonism modulates…\n[2] Striatal dopamine release dynamics…\n[3] Presynaptic D3 autoreceptor control…\n… 5 more",
        t: "14:03:41",
        feedTool: 'datacluster_keyword_search("dopamine receptors", k=8)',
        feedMeta: "8 hits · 1,240 tok · €0.0042 · bioRxiv/Neuroscience",
        hits: 8,
        tokens: 1240,
        royalty: 0.0042,
      },
      {
        icon: "plug",
        name: "crossref_search_works",
        type: "api",
        sourceKey: "crossref",
        apiRow: "crossref",
        node: "specialist",
        summary: 'doi="10.1101/2024.11…" · 1 hit · Crossref Search',
        args: '{\n  "doi": "10.1101/2024.11.03.621820",\n  "fields": ["title", "authors", "refs"]\n}',
        result: "1 hit\nResolved metadata + 38 references.\nLinked to 2 indexed preprints.",
        t: "14:03:43",
        feedTool: 'crossref_search_works(doi="10.1101/2024.11…")',
        feedMeta: "1 hit · 320 tok · €0.0008 · Crossref Search",
        hits: 1,
        tokens: 320,
        royalty: 0.0008,
      },
      {
        icon: "file",
        name: "datacluster_get_entry_content",
        type: "dataset",
        sourceKey: "notes",
        dsRow: "notes",
        node: "specialist",
        summary: 'id="bx-7714" · 1 doc · Internal clinical notes',
        args: '{\n  "id": "bx-7714",\n  "join": "internal/clinical-notes"\n}',
        result:
          "1 doc · 4,820 tokens · private cluster\nMatched 3 case records · cohort n=41.\nRetrieved in-place — content never left\npublisher-cluster.",
        t: "14:03:46",
        feedTool: 'datacluster_get_entry_content(id="bx-7714")',
        feedMeta: "1 doc · 4,820 tok · €0.0163 · Internal clinical notes",
        hits: 1,
        tokens: 4820,
        royalty: 0.0163,
      },
    ],
    chain: [
      {
        who: "Planner",
        text: "Decomposed task into 3 retrieval subtasks; routed to the retrieval specialist on the active MCP Configuration.",
      },
      {
        who: "Specialist · retrieval",
        text: "datacluster_keyword_search on bioRxiv/Neuroscience → 8 candidates; ranked by relevance to D2 antagonism.",
      },
      {
        who: "Specialist · join",
        text: "datacluster_get_entry_content joined bx-7714 against the private clinical-notes cluster (in-place, no egress).",
      },
      {
        who: "Critic",
        text: "Verified 38 Crossref references, flagged 0 unsupported citations; approved synthesis.",
      },
    ],
    answer:
      "Across the active surface I pulled 8 D2-receptor preprints from bioRxiv/Neuroscience and joined them against 3 de-identified cases in your private clinical-notes cluster. The exposure profile in bx-7714 mirrors your flagged cohort — phasic striatal signalling drops in both. Crossref confirmed 38 references with two already indexed. Every read above is attributed and metered; the synthesis itself touched no raw content outside your infrastructure…",
  }
}

export const CONFIG_JSON = `{
  "mcpServers": {
    "alien": {
      "url": "https://mcp.alien.club/mcp?config=cfg_publisher_demo"
    }
  }
}`

export const MODEL = "Claude Opus 4.7"
export const DONE3 = { planner: "done", specialist: "done", critic: "done" } as const
