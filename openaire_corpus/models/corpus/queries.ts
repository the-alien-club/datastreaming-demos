// models/corpus/queries.ts
// Pure database access for the corpus model. No business logic, no external
// calls, no transforms beyond what Prisma returns.
// Imports only from @/lib/db and ./schema.
import "server-only"

import { prisma } from "@/lib/db"
import type { Prisma } from "@/lib/generated/prisma/client"
import { CORPUS_SAMPLE_SIZE } from "@/lib/constants"
import {
  DOCUMENT_RESOLVE_STATUS,
  OPEN_ACCESS_CLASS,
  classifyOpenAccess,
  isOpenAccessClass,
} from "@/models/documents/schema"
import {
  corpusVersionWithIds,
  documentRow,
  type CorpusAggregateDimension,
  type CorpusAggregation,
  type CorpusCrossFacets,
  type CorpusDiff,
  type CorpusFacetDimension,
  type CorpusListPage,
  type DocumentRow,
  type CorpusSnapshot,
  type CorpusVersionStatus,
  type CorpusVersionWithIds,
} from "./schema"

/** Canonical open-access bucket order for aggregation output (matches the UI). */
const OA_ORDER = [
  OPEN_ACCESS_CLASS.GOLD,
  OPEN_ACCESS_CLASS.GREEN,
  OPEN_ACCESS_CLASS.HYBRID,
  OPEN_ACCESS_CLASS.BRONZE,
  OPEN_ACCESS_CLASS.CLOSED,
] as const

/** Default cap on the number of groups returned for long-tail dimensions. */
const AGGREGATE_TOP_DEFAULT = 12

// Prisma WHERE fragment matching one open-access bucket — the SQL mirror of
// classifyOpenAccess(). Precedence there is color → green → closed, so the SQL
// must exclude higher-precedence buckets from lower ones (e.g. "green" must not
// also match a gold row). Returns null for an unrecognised bucket.
function oaClassWhere(cls: string): Prisma.DocumentWhereInput | null {
  const colorInsensitive = (v: string): Prisma.DocumentWhereInput => ({
    openAccessColor: { equals: v, mode: "insensitive" },
  })
  switch (cls) {
    case OPEN_ACCESS_CLASS.GOLD:
      return colorInsensitive("gold")
    case OPEN_ACCESS_CLASS.HYBRID:
      return colorInsensitive("hybrid")
    case OPEN_ACCESS_CLASS.BRONZE:
      return colorInsensitive("bronze")
    case OPEN_ACCESS_CLASS.GREEN:
      // Green route: no explicit color, but isGreen OR bestAccessRight=OPEN.
      return {
        openAccessColor: null,
        OR: [
          { isGreen: true },
          { bestAccessRight: { equals: "OPEN", mode: "insensitive" } },
        ],
      }
    case OPEN_ACCESS_CLASS.CLOSED:
      // No color, not green, and a closed/restricted/embargoed access right.
      return {
        openAccessColor: null,
        isGreen: { not: true },
        bestAccessRight: {
          in: ["CLOSED", "RESTRICTED", "EMBARGO"],
          mode: "insensitive",
        },
      }
    default:
      return null
  }
}

/**
 * The structured filter set shared by every corpus read path (snapshot, list,
 * crossFacets) and by remove-by-filter. Mirrors the query params of
 * `GET /api/projects/:id/corpus` and the agent-tool filter schema. Multi-select
 * dimensions arrive pre-split into arrays (the route splits the CSV form).
 */
export type CorpusFilterSet = {
  /** Research-product display types (instanceType): article/preprint/dataset/… */
  type?: string[]
  lang?: string[]
  /** Open-access buckets: gold | hybrid | bronze | green | closed. */
  oa?: string[]
  /** Peer-review: "peer_reviewed" | "not_peer_reviewed". */
  peer?: string[]
  /** Funder short names. */
  funder?: string[]
  /** AppSession ids — keep only docs contributed by one of these sessions. */
  session?: string[]
  yearFrom?: number
  yearTo?: number
  undated?: boolean
  q?: string
}

/**
 * Translate a CorpusFilterSet into the two Prisma WHERE predicates every corpus
 * read shares:
 *   - `sharedWhere`   — version membership AND all active filter clauses.
 *   - `resolvedWhere` — `sharedWhere` further constrained to RESOLVED documents.
 *
 * Extracted so `list()`, `crossFacets()`, and `removeByFilter()` resolve
 * membership identically. Pure: no I/O, deterministic in its inputs.
 *
 * Year semantics: a yearFrom/yearTo range wins over `undated`; with neither,
 * `undated === true` matches `year IS NULL`. Full-text, oa, and peer each carry
 * their own `OR`/clause, so they are AND-ed via an explicit `AND` array rather
 * than spread (two `OR` keys at one object level would collide).
 */
function buildCorpusWhere(
  versionId: string,
  filters?: CorpusFilterSet,
): {
  sharedWhere: Prisma.DocumentWhereInput
  resolvedWhere: Prisma.DocumentWhereInput
  parts: {
    typeWhere: Prisma.DocumentWhereInput
    langWhere: Prisma.DocumentWhereInput
    fullTextWhere: Prisma.DocumentWhereInput
  }
} {
  const hasYearRange =
    filters?.yearFrom !== undefined || filters?.yearTo !== undefined
  const yearWhere: Prisma.DocumentWhereInput = hasYearRange
    ? {
        year: {
          ...(filters?.yearFrom !== undefined ? { gte: filters.yearFrom } : {}),
          ...(filters?.yearTo !== undefined ? { lte: filters.yearTo } : {}),
        },
      }
    : filters?.undated === true
      ? { year: null }
      : {}

  const typeWhere: Prisma.DocumentWhereInput =
    filters?.type && filters.type.length > 0
      ? { instanceType: { in: filters.type } }
      : {}

  const langWhere: Prisma.DocumentWhereInput =
    filters?.lang && filters.lang.length > 0 ? { lang: { in: filters.lang } } : {}

  const funderWhere: Prisma.DocumentWhereInput =
    filters?.funder && filters.funder.length > 0
      ? { funder: { in: filters.funder } }
      : {}

  // Session filter: keep only documents at least one of the selected sessions
  // contributed. `some` over the CorpusContribution relation gives exactly that.
  const sessionWhere: Prisma.DocumentWhereInput =
    filters?.session && filters.session.length > 0
      ? { contributions: { some: { sessionId: { in: filters.session } } } }
      : {}

  // Full-text: Prisma OR over contains (ILIKE on Postgres), matching title,
  // author, and abstract (null columns are skipped automatically).
  const fullTextWhere: Prisma.DocumentWhereInput =
    filters?.q && filters.q.trim().length > 0
      ? {
          OR: [
            { title: { contains: filters.q, mode: "insensitive" as const } },
            { author: { contains: filters.q, mode: "insensitive" as const } },
            { abstract: { contains: filters.q, mode: "insensitive" as const } },
          ],
        }
      : {}

  // OA-bucket filter: an OR over the selected buckets, each a SQL mirror of
  // classifyOpenAccess(). Constrained to resolved rows (the bucket is unknown
  // for stubs). null when no bucket is selected.
  const oaPredicates =
    filters?.oa && filters.oa.length > 0
      ? filters.oa
          .map(oaClassWhere)
          .filter((w): w is Prisma.DocumentWhereInput => w !== null)
      : []
  const oaWhere: Prisma.DocumentWhereInput | null =
    oaPredicates.length > 0
      ? { resolveStatus: DOCUMENT_RESOLVE_STATUS.RESOLVED, OR: oaPredicates }
      : null

  // Peer-review filter — tri-state column, so "not_peer_reviewed" means
  // explicitly false (unknown/null is excluded from both, never assumed).
  const wantsPeer = filters?.peer?.includes("peer_reviewed") ?? false
  const wantsNotPeer = filters?.peer?.includes("not_peer_reviewed") ?? false
  const peerWhere: Prisma.DocumentWhereInput | null =
    wantsPeer && !wantsNotPeer
      ? { peerReviewed: true }
      : wantsNotPeer && !wantsPeer
        ? { peerReviewed: false }
        : null

  const andClauses: Prisma.DocumentWhereInput[] = []
  if (filters?.q && filters.q.trim().length > 0) andClauses.push(fullTextWhere)
  if (oaWhere) andClauses.push(oaWhere)
  if (peerWhere) andClauses.push(peerWhere)

  const sharedWhere: Prisma.DocumentWhereInput = {
    membership: { some: { versionId } },
    ...typeWhere,
    ...langWhere,
    ...funderWhere,
    ...sessionWhere,
    ...yearWhere,
    ...(andClauses.length > 0 ? { AND: andClauses } : {}),
  }

  const resolvedWhere: Prisma.DocumentWhereInput = {
    ...sharedWhere,
    resolveStatus: DOCUMENT_RESOLVE_STATUS.RESOLVED,
  }

  return {
    sharedWhere,
    resolvedWhere,
    parts: { typeWhere, langWhere, fullTextWhere },
  }
}

export class CorpusQueries {
  /**
   * Returns the current head version (with membership ids) for a project.
   * Looks up via Project.headVersionId so we never scan corpus_version for
   * an isHead flag (there is none — head is identified by the Project pointer
   * only, per playbook/corpus-versioning.md).
   */
  static async headVersion(projectId: string): Promise<CorpusVersionWithIds> {
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { headVersionId: true },
    })

    if (!project.headVersionId) {
      throw new Error(
        `Project ${projectId} has no headVersionId — invariant 1 violated`,
      )
    }

    return prisma.corpusVersion.findUniqueOrThrow({
      where: { id: project.headVersionId },
      ...corpusVersionWithIds,
    })
  }

  /**
   * Returns the last successfully ingested version (with membership ids), or
   * null if the corpus has never been ingested.
   */
  static async ingestedVersion(
    projectId: string,
  ): Promise<CorpusVersionWithIds | null> {
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { ingestedVersionId: true },
    })

    if (!project.ingestedVersionId) {
      return null
    }

    return prisma.corpusVersion.findUniqueOrThrow({
      where: { id: project.ingestedVersionId },
      ...corpusVersionWithIds,
    })
  }

  /**
   * Returns the flat list of OpenAIRE ids in a corpus version.
   */
  static async membershipIds(versionId: string): Promise<string[]> {
    const rows = await prisma.corpusMembership.findMany({
      where: { versionId },
      select: { openaireId: true },
    })
    return rows.map((r) => r.openaireId)
  }

  /**
   * Returns the ids currently IN THE INDEX for a project (Document.indexedAt is
   * set). This is the per-document ground truth the ingestion delta is computed
   * against — NOT the coarse ingestedVersionId pointer, which can't express a
   * partial ingest (most docs indexed, one failed). Stamped by
   * IngestService.commit()/commitPartialFailure().
   */
  static async indexedIds(projectId: string): Promise<string[]> {
    const rows = await prisma.document.findMany({
      where: { projectId, indexedAt: { not: null } },
      select: { openaireId: true },
    })
    return rows.map((r) => r.openaireId)
  }

  /**
   * Returns the full corpus comprehension snapshot for a given version ref.
   *
   * `ref`:
   *   - "head"     → Project.headVersionId
   *   - "ingested" → Project.ingestedVersionId (throws if never ingested)
   *   - { seq: N } → looks up by (projectId, seq)
   *
   * `opts.filters` — optional filter set. When supplied, `total`, `facets`,
   * and `sample` all reflect the filtered subset (not the full corpus).
   *
   * `opts.cursor` — opaque cursor from a previous response's `nextCursor`.
   * Format: `<versionSeq>:<lastOpenaireId>`. Decoded as `WHERE openaireId >
   * lastOpenaireId ORDER BY openaireId ASC`. Stable for the same version + filters.
   *
   * `opts.limit` — page size, defaults to CORPUS_SAMPLE_SIZE (25).
   *
   * IMPORTANT: always use `total`, never `sample.length`.
   */
  static async snapshot(
    projectId: string,
    ref: "head" | "ingested" | { seq: number },
    opts?: {
      filters?: CorpusFilterSet
      cursor?: string
      limit?: number
    },
  ): Promise<CorpusSnapshot> {
    // --- Resolve the version --------------------------------------------------
    const version = await CorpusQueries.resolveVersion(projectId, ref)
    const versionId = version.id
    const filters = opts?.filters
    const limit = opts?.limit ?? CORPUS_SAMPLE_SIZE

    // --- Build the shared filter WHERE clause --------------------------------
    const { sharedWhere, resolvedWhere, parts } = buildCorpusWhere(
      versionId,
      filters,
    )
    const { typeWhere, langWhere, fullTextWhere } = parts

    // --- Decode cursor -------------------------------------------------------
    // Cursor format: "<versionSeq>:<lastOpenaireId>" — we only use the id here.
    let cursorId: string | undefined
    if (opts?.cursor) {
      const colonIdx = opts.cursor.indexOf(":")
      if (colonIdx !== -1) {
        cursorId = opts.cursor.slice(colonIdx + 1)
      }
    }

    // --- Total filtered count + facets ---------------------------------------
    const [
      total,
      undatedCount,
      pendingCount,
      failedCount,
      typeRows,
      langRows,
      resolvedRows,
    ] = await Promise.all([
      // Total within filtered set (includes pending/failed members when no
      // type/lang/year/q filter excludes them).
      prisma.document.count({ where: sharedWhere }),
      // Undated count: RESOLVED docs with no year. Year filter intentionally not
      // applied so the "undated" tile stays informative under an active range.
      prisma.document.count({
        where: {
          membership: { some: { versionId } },
          ...typeWhere,
          ...langWhere,
          ...fullTextWhere,
          resolveStatus: DOCUMENT_RESOLVE_STATUS.RESOLVED,
          year: null,
        },
      }),
      // Pending / failed: only membership (type/lang/year/q/oa/peer cannot
      // describe an unresolved stub).
      prisma.document.count({
        where: {
          membership: { some: { versionId } },
          resolveStatus: DOCUMENT_RESOLVE_STATUS.PENDING,
        },
      }),
      prisma.document.count({
        where: {
          membership: { some: { versionId } },
          resolveStatus: DOCUMENT_RESOLVE_STATUS.FAILED,
        },
      }),

      // Facet: instanceType (resolved; non-null once resolved).
      prisma.document.groupBy({
        by: ["instanceType"],
        where: { ...resolvedWhere, instanceType: { not: null } },
        _count: true,
      }),
      // Facet: lang (resolved; skip null lang values).
      prisma.document.groupBy({
        by: ["lang"],
        where: { ...resolvedWhere, lang: { not: null } },
        _count: true,
      }),
      // Resolved rows: one pass powers the period histogram (binned in JS), the
      // OA facet, and the access/peer/abstract breakdown (classified in JS).
      prisma.document.findMany({
        where: resolvedWhere,
        select: {
          year: true,
          openAccessColor: true,
          isGreen: true,
          bestAccessRight: true,
          abstract: true,
          peerReviewed: true,
        },
      }),
    ])

    // --- Session facet (grouped over contributions, scoped to filtered set) --
    const sessionRows = await prisma.corpusContribution.groupBy({
      by: ["sessionId"],
      where: { projectId, document: { ...sharedWhere } },
      _count: true,
    })

    // --- Fold facet rows into Record<string, number> -------------------------
    const typeFacet: Record<string, number> = {}
    for (const r of typeRows) {
      if (r.instanceType !== null) typeFacet[r.instanceType] = r._count
    }

    const langFacet: Record<string, number> = {}
    for (const r of langRows) {
      if (r.lang !== null) langFacet[r.lang] = r._count
    }

    // Session facet: resolve each contributing session's title and assemble a
    // count-sorted list (a dedicated array — not a Record — because each entry
    // carries a title the UI renders as the chip/bar label).
    const sessionCounts = new Map<string, number>()
    for (const r of sessionRows) {
      sessionCounts.set(r.sessionId, r._count)
    }
    const sessionTitles =
      sessionCounts.size > 0
        ? await prisma.appSession.findMany({
            where: { id: { in: [...sessionCounts.keys()] } },
            select: { id: true, title: true },
          })
        : []
    const titleById = new Map(sessionTitles.map((s) => [s.id, s.title]))
    const sessions = [...sessionCounts.entries()]
      .map(([sessionId, count]) => ({
        sessionId,
        title: titleById.get(sessionId) ?? sessionId,
        count,
      }))
      .sort((a, b) => b.count - a.count)

    // Bin years into decade buckets AND classify each resolved row into an OA
    // bucket + access/peer/abstract counts — all from the single resolvedRows pass.
    const periodFacet: Record<string, number> = {}
    const oaFacet: Record<string, number> = {}
    const access = {
      resolved: resolvedRows.length,
      open: 0,
      withAbstract: 0,
      peerReviewed: 0,
      openAccess: {} as Record<string, number>,
    }
    for (const r of resolvedRows) {
      if (r.year !== null) {
        const decade = Math.floor(r.year / 10) * 10
        const bucket = `${decade}s`
        periodFacet[bucket] = (periodFacet[bucket] ?? 0) + 1
      }

      if (r.abstract && r.abstract.trim() !== "") access.withAbstract++
      if (r.peerReviewed === true) access.peerReviewed++

      const cls = classifyOpenAccess({
        openAccessColor: r.openAccessColor,
        isGreen: r.isGreen,
        bestAccessRight: r.bestAccessRight,
      })
      if (cls !== null) {
        oaFacet[cls] = (oaFacet[cls] ?? 0) + 1
        access.openAccess[cls] = (access.openAccess[cls] ?? 0) + 1
        if (isOpenAccessClass(cls)) access.open++
      }
    }

    // NOTE: pending stubs are NOT injected into the facet records — they are
    // surfaced via pendingCount/failedCount, which the UI renders separately.

    // --- Sample (cursor-paginated) -------------------------------------------
    // ORDER BY openaireId ASC — stable and deterministic keyset pagination.
    // limit === 0 means counts/facets only (corpus_stats) — skip the query.
    const sampleRows =
      limit > 0
        ? await prisma.document.findMany({
            where: cursorId
              ? { ...sharedWhere, openaireId: { gt: cursorId } }
              : sharedWhere,
            orderBy: { openaireId: "asc" },
            take: limit + 1,
            ...documentRow,
          })
        : []

    let nextCursor: string | undefined
    if (sampleRows.length > limit) {
      const lastRow = sampleRows[limit - 1]
      nextCursor = `${version.seq}:${lastRow.openaireId}`
    }

    const sample = sampleRows.slice(0, limit)

    return {
      versionSeq: version.seq,
      versionStatus: version.status as CorpusVersionStatus,
      total,
      undatedCount,
      pendingCount,
      failedCount,
      facets: {
        type: typeFacet,
        lang: langFacet,
        oa: oaFacet,
        period: periodFacet,
      },
      sessions,
      access,
      sample,
      ...(nextCursor !== undefined ? { nextCursor } : {}),
    }
  }

  /**
   * Resolve a version ref ("head" | "ingested" | { seq }) to its concrete
   * CorpusVersion row. Shared by snapshot/list/crossFacets so they agree on
   * what "head" means.
   */
  private static async resolveVersion(
    projectId: string,
    ref: "head" | "ingested" | { seq: number },
  ): Promise<CorpusVersionWithIds> {
    if (ref === "head") {
      return CorpusQueries.headVersion(projectId)
    }
    if (ref === "ingested") {
      const v = await CorpusQueries.ingestedVersion(projectId)
      if (!v) {
        throw new Error(`Project ${projectId} has never been ingested`)
      }
      return v
    }
    return prisma.corpusVersion.findUniqueOrThrow({
      where: { projectId_seq: { projectId, seq: ref.seq } },
      ...corpusVersionWithIds,
    })
  }

  /**
   * Returns a flat, cursor-paginated page of corpus documents matching the
   * active filters — the exhaustive-listing counterpart to `snapshot()`.
   * Computes NO facets: the cheap path the agent walks page-by-page.
   *
   * Pagination is keyset: ORDER BY openaireId ASC, cursor =
   * `<versionSeq>:<lastOpenaireId>`, decoded as `WHERE openaireId > lastOpenaireId`.
   */
  static async list(
    projectId: string,
    ref: "head" | "ingested" | { seq: number },
    opts?: { filters?: CorpusFilterSet; cursor?: string; limit?: number },
  ): Promise<CorpusListPage> {
    const version = await CorpusQueries.resolveVersion(projectId, ref)
    const versionId = version.id
    const limit = opts?.limit ?? CORPUS_SAMPLE_SIZE
    const { sharedWhere } = buildCorpusWhere(versionId, opts?.filters)

    let cursorId: string | undefined
    if (opts?.cursor) {
      const colonIdx = opts.cursor.indexOf(":")
      if (colonIdx !== -1) cursorId = opts.cursor.slice(colonIdx + 1)
    }

    const [total, rows] = await Promise.all([
      prisma.document.count({ where: sharedWhere }),
      prisma.document.findMany({
        where: cursorId
          ? { ...sharedWhere, openaireId: { gt: cursorId } }
          : sharedWhere,
        orderBy: { openaireId: "asc" },
        take: limit + 1,
        ...documentRow,
      }),
    ])

    let nextCursor: string | undefined
    if (rows.length > limit) {
      nextCursor = `${version.seq}:${rows[limit - 1].openaireId}`
    }

    return {
      versionSeq: version.seq,
      total,
      documents: rows.slice(0, limit),
      nextCursor,
    }
  }

  /**
   * Returns every document in a version matching the active filters, ordered by
   * openaireId — the unbounded read behind the CSV export. No pagination: a file
   * export needs the whole set in one pass. Includes pending/failed stubs (real
   * members); their `resolveStatus` tells the consumer they are not yet resolved.
   */
  static async exportRows(
    projectId: string,
    ref: "head" | "ingested" | { seq: number },
    filters?: CorpusFilterSet,
  ): Promise<{ versionSeq: number; rows: DocumentRow[] }> {
    const version = await CorpusQueries.resolveVersion(projectId, ref)
    const { sharedWhere } = buildCorpusWhere(version.id, filters)
    const rows = await prisma.document.findMany({
      where: sharedWhere,
      orderBy: { openaireId: "asc" },
      ...documentRow,
    })
    return { versionSeq: version.seq, rows }
  }

  /**
   * Cross-tabulate two facet dimensions over the filtered, RESOLVED corpus.
   * Implemented as a single resolved-set pass binned in JS. Rows where either
   * dimension is null are skipped. `cells` is sparse and sorted by count desc.
   */
  static async crossFacets(
    projectId: string,
    ref: "head" | "ingested" | { seq: number },
    dims: [CorpusFacetDimension, CorpusFacetDimension],
    filters?: CorpusFilterSet,
  ): Promise<CorpusCrossFacets> {
    const version = await CorpusQueries.resolveVersion(projectId, ref)
    const { resolvedWhere } = buildCorpusWhere(version.id, filters)

    const rows = await prisma.document.findMany({
      where: resolvedWhere,
      select: {
        year: true,
        instanceType: true,
        lang: true,
        openAccessColor: true,
        isGreen: true,
        bestAccessRight: true,
      },
    })

    type Row = (typeof rows)[number]
    const valueOf = (dim: CorpusFacetDimension, row: Row): string | null => {
      switch (dim) {
        case "period":
          return row.year !== null ? `${Math.floor(row.year / 10) * 10}s` : null
        case "type":
          return row.instanceType
        case "lang":
          return row.lang
        case "oa":
          return classifyOpenAccess({
            openAccessColor: row.openAccessColor,
            isGreen: row.isGreen,
            bestAccessRight: row.bestAccessRight,
          })
      }
    }

    const counts = new Map<string, Map<string, number>>()
    for (const row of rows) {
      const a = valueOf(dims[0], row)
      const b = valueOf(dims[1], row)
      if (a === null || b === null) continue
      const inner = counts.get(a) ?? new Map<string, number>()
      inner.set(b, (inner.get(b) ?? 0) + 1)
      counts.set(a, inner)
    }

    const cells = [...counts.entries()]
      .flatMap(([a, inner]) =>
        [...inner.entries()].map(([b, count]) => ({ a, b, count })),
      )
      .sort((x, y) => y.count - x.count)

    return { dims, cells }
  }

  /**
   * Group the RESOLVED corpus by a single dimension and return real counts — the
   * raw material for a chart embedded in a research note. Reuses the shared
   * `buildCorpusWhere` scoping so an aggregation honours the same filters as any
   * other corpus read. `total` is the resolved count in scope (the denominator);
   * groups are ordered per dimension (chronological / canonical / count-desc).
   *
   * `opts.top` caps long-tail dimensions (funder/publisher/venue); the default is
   * AGGREGATE_TOP_DEFAULT. It is ignored for the naturally-bounded dimensions.
   */
  static async aggregate(
    projectId: string,
    ref: "head" | "ingested" | { seq: number },
    opts: {
      dimension: CorpusAggregateDimension
      filters?: CorpusFilterSet
      top?: number
    },
  ): Promise<CorpusAggregation> {
    const version = await CorpusQueries.resolveVersion(projectId, ref)
    const { resolvedWhere } = buildCorpusWhere(version.id, opts.filters)
    const top = opts.top ?? AGGREGATE_TOP_DEFAULT
    const dimension = opts.dimension

    const total = await prisma.document.count({ where: resolvedWhere })

    let groups: { key: string; value: number }[]

    switch (dimension) {
      case "year": {
        const rows = await prisma.document.groupBy({
          by: ["year"],
          where: { ...resolvedWhere, year: { not: null } },
          _count: true,
        })
        groups = rows
          .filter((r): r is typeof r & { year: number } => r.year !== null)
          .map((r) => ({ key: String(r.year), value: r._count }))
          .sort((a, b) => Number(a.key) - Number(b.key))
        break
      }
      case "decade": {
        const rows = await prisma.document.findMany({
          where: { ...resolvedWhere, year: { not: null } },
          select: { year: true },
        })
        const bins = new Map<number, number>()
        for (const r of rows) {
          if (r.year === null) continue
          const decade = Math.floor(r.year / 10) * 10
          bins.set(decade, (bins.get(decade) ?? 0) + 1)
        }
        groups = [...bins.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([decade, value]) => ({ key: `${decade}s`, value }))
        break
      }
      case "type":
      case "lang":
      case "access_right":
      case "funder":
      case "publisher":
      case "venue": {
        const column = {
          type: "instanceType",
          lang: "lang",
          access_right: "bestAccessRight",
          funder: "funder",
          publisher: "publisher",
          venue: "venue",
        }[dimension] as
          | "instanceType"
          | "lang"
          | "bestAccessRight"
          | "funder"
          | "publisher"
          | "venue"
        const rows = await prisma.document.groupBy({
          by: [column],
          where: { ...resolvedWhere, [column]: { not: null } },
          _count: true,
        })
        const sorted = rows
          .map((r) => ({ key: String(r[column]), value: r._count }))
          .sort((a, b) => b.value - a.value)
        // Long-tail dimensions (funder/publisher/venue) are capped; the naturally
        // bounded ones (type/lang/access_right) are returned whole.
        const bounded =
          dimension === "funder" || dimension === "publisher" || dimension === "venue"
        groups = bounded ? sorted.slice(0, top) : sorted
        break
      }
      case "oa": {
        const rows = await prisma.document.findMany({
          where: resolvedWhere,
          select: { openAccessColor: true, isGreen: true, bestAccessRight: true },
        })
        const counts = new Map<string, number>()
        for (const r of rows) {
          const cls = classifyOpenAccess({
            openAccessColor: r.openAccessColor,
            isGreen: r.isGreen,
            bestAccessRight: r.bestAccessRight,
          })
          if (cls !== null) counts.set(cls, (counts.get(cls) ?? 0) + 1)
        }
        groups = OA_ORDER.filter((cls) => counts.has(cls)).map((cls) => ({
          key: cls,
          value: counts.get(cls) as number,
        }))
        break
      }
      case "peer_reviewed": {
        const [peer, notPeer] = await Promise.all([
          prisma.document.count({ where: { ...resolvedWhere, peerReviewed: true } }),
          prisma.document.count({ where: { ...resolvedWhere, peerReviewed: false } }),
        ])
        const unknown = total - peer - notPeer
        groups = [
          { key: "peer_reviewed", value: peer },
          { key: "not_peer_reviewed", value: notPeer },
          { key: "unknown", value: unknown },
        ].filter((g) => g.value > 0)
        break
      }
    }

    return { dimension, total, groups }
  }

  /**
   * Resolve the ids in a version matching the given filters. Powers
   * remove-by-filter: the service resolves the target ids here, then either
   * previews them (dry run) or hands them to `removeIds()`. Returns the ids in
   * stable ascending order so a preview is reproducible.
   */
  static async idsMatchingFilters(
    projectId: string,
    ref: "head" | "ingested" | { seq: number },
    filters?: CorpusFilterSet,
  ): Promise<string[]> {
    const version = await CorpusQueries.resolveVersion(projectId, ref)
    const { sharedWhere } = buildCorpusWhere(version.id, filters)
    const rows = await prisma.document.findMany({
      where: sharedWhere,
      select: { openaireId: true },
      orderBy: { openaireId: "asc" },
    })
    return rows.map((r) => r.openaireId)
  }

  /**
   * Computes the diff between two corpus versions in the same project.
   * Returns the ids added (in `toSeq` not `fromSeq`) and removed (in `fromSeq`
   * not `toSeq`). Sets are built in JS; efficient for thousands of ids.
   */
  static async diff(
    projectId: string,
    fromSeq: number,
    toSeq: number,
  ): Promise<CorpusDiff> {
    const [from, to] = await Promise.all([
      prisma.corpusVersion.findUniqueOrThrow({
        where: { projectId_seq: { projectId, seq: fromSeq } },
      }),
      prisma.corpusVersion.findUniqueOrThrow({
        where: { projectId_seq: { projectId, seq: toSeq } },
      }),
    ])

    const [fromIds, toIds] = await Promise.all([
      CorpusQueries.membershipIds(from.id),
      CorpusQueries.membershipIds(to.id),
    ])

    const fromSet = new Set(fromIds)
    const toSet = new Set(toIds)

    const added = toIds.filter((a) => !fromSet.has(a))
    const removed = fromIds.filter((a) => !toSet.has(a))

    return {
      fromSeq,
      toSeq,
      added,
      removed,
      addedCount: added.length,
      removedCount: removed.length,
    }
  }
}
