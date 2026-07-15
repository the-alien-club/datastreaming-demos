/**
 * Corpus tool definitions for the OpenAIRE corpus agent.
 *
 * Full lifecycle of corpus mutations and inspection:
 *   - corpus_get_state       — full snapshot (facets + sample) of the head
 *   - corpus_list            — paginated enumeration (no facets)
 *   - corpus_add             — add records (OpenAIRE ids or DOIs), advance version
 *   - corpus_remove          — remove records, advance version
 *   - corpus_remove_by_filter — bulk removal by metadata filter (dry-run first)
 *   - corpus_stats           — facet-only view + optional cross-facets
 *   - corpus_diff            — compare two version seqs
 *
 * Every mutating tool publishes a `corpus_event` via `ctx.emit` so connected
 * SSE clients receive real-time feedback without polling.
 */
import "server-only"

import { z } from "zod"
import { defineTool } from "@alien/chat-sdk/claude"
import { CORPUS_REASON_MAX_LEN } from "@/lib/constants"
import { prisma } from "@/lib/db"
import { kickResolve } from "@/lib/documents/resolver"
import { CorpusQueries } from "@/models/corpus/queries"
import { CorpusService } from "@/models/corpus/service"
import { openaireRefSchema } from "@/models/corpus/types"
import type { CorpusFilterSet } from "@/models/corpus/queries"
import type { TurnScopedCtx } from "./registry-factory"
import { AGENT_TOOLS } from "./constants"

// ---------------------------------------------------------------------------
// Shared filter schema
// ---------------------------------------------------------------------------

const oaClassEnum = z.enum(["gold", "hybrid", "bronze", "green", "closed"])
const peerEnum = z.enum(["peer_reviewed", "not_peer_reviewed"])

/**
 * The metadata filter set the corpus agent passes to narrow a read or a bulk
 * removal. Mirrors `CorpusFilterSet` (models/corpus/queries.ts) minus `session`
 * (a UI-only attribution facet). All fields optional; absent means "no
 * constraint on this dimension". Multi-select dimensions are arrays.
 */
const corpusFiltersSchema = z
  .object({
    type: z
      .array(z.string())
      .optional()
      .describe('Research-product types to keep, e.g. ["article","preprint","dataset"].'),
    lang: z
      .array(z.string())
      .optional()
      .describe('ISO 639-1 language codes to keep, e.g. ["en","fr"].'),
    oa: z
      .array(oaClassEnum)
      .optional()
      .describe("Open-access buckets to keep: gold | hybrid | bronze | green | closed."),
    peer: z
      .array(peerEnum)
      .optional()
      .describe("Peer-review status to keep: peer_reviewed | not_peer_reviewed."),
    funder: z
      .array(z.string())
      .optional()
      .describe('Funder short names to keep, e.g. ["EC","NIH"].'),
    yearFrom: z
      .number()
      .int()
      .optional()
      .describe("Publication year lower bound, inclusive (e.g. 2013)."),
    yearTo: z
      .number()
      .int()
      .optional()
      .describe("Publication year upper bound, inclusive (e.g. 2016)."),
    undated: z
      .boolean()
      .optional()
      .describe(
        "Keep only documents with an unknown date. Ignored when yearFrom/yearTo is set.",
      ),
    q: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Free-text match over title, author, and abstract."),
  })
  .describe("Metadata filters. Omit a field to leave that dimension unconstrained.")

/** The document fields corpus_list may project. `openaireId` is always returned. */
const corpusListFieldEnum = z.enum([
  "doi",
  "title",
  "author",
  "year",
  "dateLabel",
  "docType",
  "instanceType",
  "lang",
  "publisher",
  "venue",
  "openAccessColor",
  "peerReviewed",
  "citationCount",
  "resolveStatus",
])

const facetDimensionEnum = z.enum(["period", "type", "lang", "oa"])

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function projectIdFromSession(appSessionId: string): Promise<string> {
  const session = await prisma.appSession.findUniqueOrThrow({
    where: { id: appSessionId },
    select: { projectId: true },
  })
  return session.projectId
}

// ---------------------------------------------------------------------------
// corpus_get_state
// ---------------------------------------------------------------------------

export const corpusGetStateTool = defineTool<
  z.ZodObject<{
    include_sample: z.ZodOptional<z.ZodBoolean>
    sample_limit: z.ZodOptional<z.ZodNumber>
    filters: z.ZodOptional<typeof corpusFiltersSchema>
  }>,
  TurnScopedCtx
>({
  name: AGENT_TOOLS.corpusGetState,
  description:
    "Retrieve the current corpus state for this project: total record count, " +
    "facets (type, language, open access, period), the access & peer-review " +
    "breakdown, and an optional paginated document sample. Call this at the start " +
    "of each corpus session to orient yourself, and after mutations to verify the " +
    "result. Pass include_sample=false when you only need counts/facets. Pass " +
    "`filters` to scope the total, facets, AND sample to a subset — every count " +
    "shrinks to the filtered set. To exhaustively enumerate a filtered subset page " +
    "by page, prefer corpus_list.",
  inputSchema: z.object({
    include_sample: z
      .boolean()
      .optional()
      .describe("Whether to include a document sample. Default true."),
    sample_limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Maximum number of sample documents to return (1–100, default 25)."),
    filters: corpusFiltersSchema.optional(),
  }),
  handler: async (input, ctx) => {
    const includeSample = input.include_sample ?? true
    const sampleLimit = input.sample_limit
    const filters = input.filters as CorpusFilterSet | undefined
    const projectId = await projectIdFromSession(ctx.appSessionId)
    const snapshot = await CorpusQueries.snapshot(
      projectId,
      "head",
      includeSample ? { filters, limit: sampleLimit } : { filters, limit: 0 },
    )
    if (!includeSample) {
      const { sample: _sample, ...rest } = snapshot
      return rest
    }
    return snapshot
  },
})

// ---------------------------------------------------------------------------
// corpus_list
// ---------------------------------------------------------------------------

export const corpusListTool = defineTool<
  z.ZodObject<{
    filters: z.ZodOptional<typeof corpusFiltersSchema>
    cursor: z.ZodOptional<z.ZodString>
    limit: z.ZodOptional<z.ZodNumber>
    fields: z.ZodOptional<z.ZodArray<typeof corpusListFieldEnum>>
  }>,
  TurnScopedCtx
>({
  name: AGENT_TOOLS.corpusList,
  description:
    "List the corpus documents matching `filters`, one page at a time, with NO " +
    "facets (faster than corpus_get_state — use this to ENUMERATE documents, not " +
    "for aggregate stats). Returns `total`, `documents` (one page), and " +
    "`nextCursor`. To walk the whole filtered set, call again passing the returned " +
    "`nextCursor` until it is absent. Use `fields` to request only the columns you " +
    "need (openaireId is always included) to keep responses compact.",
  inputSchema: z.object({
    filters: corpusFiltersSchema.optional(),
    cursor: z
      .string()
      .optional()
      .describe("Opaque pagination cursor from a previous call's `nextCursor`. Omit for the first page."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe("Page size (1–200, default 25)."),
    fields: z
      .array(corpusListFieldEnum)
      .optional()
      .describe("Document fields to return besides `openaireId` (always included). Omit to return all fields."),
  }),
  handler: async (input, ctx) => {
    const filters = input.filters as CorpusFilterSet | undefined
    const projectId = await projectIdFromSession(ctx.appSessionId)
    const page = await CorpusQueries.list(projectId, "head", {
      filters,
      cursor: input.cursor,
      limit: input.limit,
    })

    const documents =
      input.fields && input.fields.length > 0
        ? page.documents.map((doc) => {
            const picked: Record<string, unknown> = { openaireId: doc.openaireId }
            for (const f of input.fields as (keyof typeof doc)[]) {
              picked[f] = doc[f]
            }
            return picked
          })
        : page.documents

    return {
      versionSeq: page.versionSeq,
      total: page.total,
      documents,
      ...(page.nextCursor !== undefined ? { nextCursor: page.nextCursor } : {}),
    }
  },
})

// ---------------------------------------------------------------------------
// corpus_add
// ---------------------------------------------------------------------------

export const corpusAddTool = defineTool<
  z.ZodObject<{
    ids: z.ZodArray<typeof openaireRefSchema>
    reason: z.ZodString
  }>,
  TurnScopedCtx
>({
  name: AGENT_TOOLS.corpusAdd,
  description:
    "Add one or more research products to the project's corpus. Each item is " +
    "either an OpenAIRE Graph id (e.g. doi_dedup___::<hash>, as returned by the " +
    "OpenAIRE search tools) OR a DOI (e.g. 10.1038/nbt.2647). The add is INSTANT — " +
    "records join the corpus immediately and a new corpus version is created. " +
    "Full metadata (title, abstract, authors, open-access status, citations) is " +
    "then resolved in the BACKGROUND, so this returns before resolution completes. " +
    "IMPORTANT — do NOT pre-filter, cross-reference, or deduplicate against the " +
    "current corpus yourself: pass EVERY id/DOI you found in one call. This tool " +
    "deduplicates server-side and tells you what actually happened. Result fields: " +
    "`requested` (items you supplied), `added` (newly added this call), " +
    "`duplicates` (skipped because already present or repeated), `unresolved` " +
    "(DOIs the OpenAIRE Graph did not recognise — reported so you can tell the " +
    "user which inputs were dropped), `total` (corpus size), `pending` (added docs " +
    "still resolving in the background).",
  inputSchema: z.object({
    ids: z
      .array(openaireRefSchema)
      .min(1)
      .max(5_000)
      .describe('OpenAIRE ids and/or DOIs to add (e.g. ["10.1038/nbt.2647","doi_dedup___::abc…"]).'),
    reason: z
      .string()
      .trim()
      .min(1)
      .max(CORPUS_REASON_MAX_LEN)
      .describe(
        "Short reason for adding these records — ONE sentence, stored as the " +
          "version note (the user's intent, e.g. « foundational Cas9 off-target " +
          "papers 2013–2016 »). Do not restate every id.",
      ),
  }),
  handler: async (input, ctx) => {
    const projectId = await projectIdFromSession(ctx.appSessionId)
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })

    const result = await CorpusService.addIds(
      project,
      ctx.user,
      { ids: input.ids, reason: input.reason },
      // Per-session attribution: tag every added id with this session.
      ctx.appSessionId,
    )

    if (result.pending > 0) kickResolve(projectId)

    ctx.emit?.({
      type: "corpus_event",
      data: {
        kind: "add",
        count: result.lastDeltaAdded,
        versionSeq: result.versionSeq,
      },
    })

    return {
      requested: result.requested,
      added: result.lastDeltaAdded,
      duplicates: result.duplicates,
      unresolved: result.unresolved,
      versionSeq: result.versionSeq,
      total: result.total,
      pending: result.pending,
    }
  },
})

// ---------------------------------------------------------------------------
// corpus_remove
// ---------------------------------------------------------------------------

export const corpusRemoveTool = defineTool<
  z.ZodObject<{
    ids: z.ZodArray<z.ZodString>
    reason: z.ZodString
  }>,
  TurnScopedCtx
>({
  name: AGENT_TOOLS.corpusRemove,
  description:
    "Remove one or more documents (identified by OpenAIRE id) from the project's " +
    "corpus. Creates a new immutable corpus version. Documents not currently in " +
    "the corpus are silently ignored. Removing a document does NOT delete it from " +
    "the database — it only removes its membership in the current version.",
  inputSchema: z.object({
    ids: z
      .array(z.string().trim().min(1))
      .min(1)
      .max(5_000)
      .describe("List of OpenAIRE ids to remove."),
    reason: z
      .string()
      .trim()
      .min(1)
      .max(CORPUS_REASON_MAX_LEN)
      .describe("Short reason for removing these documents — ONE sentence, stored as the version note."),
  }),
  handler: async (input, ctx) => {
    const projectId = await projectIdFromSession(ctx.appSessionId)
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })

    const result = await CorpusService.removeIds(project, ctx.user, {
      ids: input.ids,
      reason: input.reason,
    })

    ctx.emit?.({
      type: "corpus_event",
      data: {
        kind: "remove",
        count: result.lastDeltaRemoved,
        versionSeq: result.versionSeq,
      },
    })

    return {
      removed: result.lastDeltaRemoved,
      versionSeq: result.versionSeq,
      total: result.total,
    }
  },
})

// ---------------------------------------------------------------------------
// corpus_remove_by_filter
// ---------------------------------------------------------------------------

export const corpusRemoveByFilterTool = defineTool<
  z.ZodObject<{
    filters: typeof corpusFiltersSchema
    reason: z.ZodString
    dry_run: z.ZodOptional<z.ZodBoolean>
  }>,
  TurnScopedCtx
>({
  name: AGENT_TOOLS.corpusRemoveByFilter,
  description:
    "Remove EVERY document matching a metadata filter from the corpus in one " +
    "operation — the bulk counterpart to corpus_remove. Use it to drop a whole " +
    'sub-population (e.g. "closed-access preprints before 2015": ' +
    '`{"filters":{"oa":["closed"],"type":["preprint"],"yearTo":2014}}`). ' +
    "ALWAYS preview first with dry_run=true (the default): it returns `matched` and " +
    "a sample of ids WITHOUT changing anything. Show the user that count, get " +
    "confirmation, THEN call again with dry_run=false to commit. An empty filter is " +
    'refused (status "empty_filter"). Removing a document drops its membership only.',
  inputSchema: z.object({
    filters: corpusFiltersSchema,
    reason: z
      .string()
      .trim()
      .min(1)
      .max(CORPUS_REASON_MAX_LEN)
      .describe("Short reason for the removal — ONE sentence, stored as the version note."),
    dry_run: z
      .boolean()
      .optional()
      .describe("When true (default), preview only — report what would be removed without mutating. Set false to commit."),
  }),
  handler: async (input, ctx) => {
    const projectId = await projectIdFromSession(ctx.appSessionId)
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })
    const dryRun = input.dry_run ?? true

    const result = await CorpusService.removeByFilter(project, ctx.user, {
      filters: input.filters as CorpusFilterSet,
      reason: input.reason,
      dryRun,
    })

    if (result.status === "removed" && result.removed > 0) {
      ctx.emit?.({
        type: "corpus_event",
        data: { kind: "remove", count: result.removed, versionSeq: result.versionSeq },
      })
    }

    return result
  },
})

// ---------------------------------------------------------------------------
// corpus_stats
// ---------------------------------------------------------------------------

export const corpusStatsTool = defineTool<
  z.ZodObject<{
    filters: z.ZodOptional<typeof corpusFiltersSchema>
    cross_facets: z.ZodOptional<z.ZodTuple<[typeof facetDimensionEnum, typeof facetDimensionEnum]>>
  }>,
  TurnScopedCtx
>({
  name: AGENT_TOOLS.corpusStats,
  description:
    "Return facet counts (type, language, open access, period), the access & " +
    "peer-review breakdown, and total record count for the current corpus — " +
    "without a document sample. Faster than corpus_get_state when you only need " +
    "aggregate statistics. Pass `filters` to scope every count to a subset. Pass " +
    '`cross_facets` (a pair of dimensions, e.g. ["period","type"]) to ALSO get a ' +
    "crossed breakdown — the count for each combination (e.g. how many 2013 " +
    "articles vs. 2013 preprints).",
  inputSchema: z.object({
    filters: corpusFiltersSchema.optional(),
    cross_facets: z
      .tuple([facetDimensionEnum, facetDimensionEnum])
      .optional()
      .describe('Two dimensions to cross-tabulate, e.g. ["period","type"] or ["oa","type"].'),
  }),
  handler: async (input, ctx) => {
    const filters = input.filters as CorpusFilterSet | undefined
    const projectId = await projectIdFromSession(ctx.appSessionId)
    const snapshot = await CorpusQueries.snapshot(projectId, "head", {
      filters,
      limit: 0,
    })
    const { sample: _sample, ...stats } = snapshot

    if (!input.cross_facets) return stats

    const cross = await CorpusQueries.crossFacets(
      projectId,
      "head",
      [input.cross_facets[0], input.cross_facets[1]],
      filters,
    )
    return { ...stats, cross }
  },
})

// ---------------------------------------------------------------------------
// corpus_diff
// ---------------------------------------------------------------------------

export const corpusDiffTool = defineTool<
  z.ZodObject<{
    from_seq: z.ZodNumber
    to_seq: z.ZodNumber
  }>,
  TurnScopedCtx
>({
  name: AGENT_TOOLS.corpusDiff,
  description:
    "Compare two corpus versions and return the list of OpenAIRE ids added and " +
    "removed between them. Useful for explaining what changed across sessions.",
  inputSchema: z.object({
    from_seq: z.number().int().positive().describe("The earlier version sequence number (from)."),
    to_seq: z.number().int().positive().describe("The later version sequence number (to)."),
  }),
  handler: async (input, ctx) => {
    const projectId = await projectIdFromSession(ctx.appSessionId)
    return CorpusQueries.diff(projectId, input.from_seq, input.to_seq)
  },
})

// Convenience array for the registry builder.
export const corpusTools = [
  corpusGetStateTool,
  corpusListTool,
  corpusAddTool,
  corpusRemoveTool,
  corpusRemoveByFilterTool,
  corpusStatsTool,
  corpusDiffTool,
] as const
