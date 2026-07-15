/**
 * GET /api/projects/:id/corpus/export
 *
 * Streams the corpus as a CSV file. Honours the same version + filter query
 * params as `GET /api/projects/:id/corpus`, so the export reflects exactly the
 * subset the comprehension panel is showing.
 *
 * Columns are stable, machine-readable snake_case (not i18n labels) — this is a
 * data export meant to be re-loaded into other tools, so it must not shift with
 * the UI locale. Mirrors the admin usage export convention.
 *
 * This route returns `text/csv`, so it is exempt from the `ok<T>()` JSON
 * envelope rule (same exemption as the SSE stream and the admin CSV export) —
 * but NOT from query validation or authorization.
 *
 * Authorization: project member (read) or admin (before() bypass).
 */
import { withAuth } from "@/app/api/_middleware"
import { parseQuery } from "@/app/api/_helpers"
import { notFound } from "@/lib/api-response"
import { z } from "zod"
import { ProjectQueries } from "@/models/projects/queries"
import { CorpusPolicy } from "@/models/corpus/policy"
import { CorpusQueries, type CorpusFilterSet } from "@/models/corpus/queries"
import { corpusFiltersSchema } from "@/models/corpus/types"
import { classifyOpenAccess } from "@/models/documents/schema"
import { DOI_URL, OPENAIRE_RECORD_URL } from "@/lib/constants"
import { toCsv } from "@/lib/csv"
import type { DocumentRow } from "@/models/corpus/schema"

const exportQuerySchema = corpusFiltersSchema.extend({
  version: z
    .union([
      z.literal("head"),
      z.literal("ingested"),
      z.coerce.number().int().positive(),
    ])
    .optional(),
})

/**
 * Split a CSV query-string value into a trimmed, non-empty string array.
 * Returns undefined when absent or whitespace-only. Mirrors the helper in the
 * corpus snapshot route — the two routes parse the same filter vocabulary.
 */
function splitCsv(value: string | undefined): string[] | undefined {
  if (!value) return undefined
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  return parts.length > 0 ? parts : undefined
}

/** Stable CSV header — snake_case, locale-independent. */
const EXPORT_HEADER = [
  "openaire_id",
  "doi",
  "title",
  "author",
  "year",
  "date_label",
  "type",
  "instance_type",
  "lang",
  "publisher",
  "venue",
  "open_access",
  "peer_reviewed",
  "citation_count",
  "funder",
  "resolve_status",
  "doi_url",
  "openaire_record_url",
] as const

/** Collapsed open-access bucket (empty until metadata resolves). */
function openAccessClass(row: DocumentRow): string {
  return (
    classifyOpenAccess({
      openAccessColor: row.openAccessColor,
      isGreen: row.isGreen,
      bestAccessRight: row.bestAccessRight,
    }) ?? ""
  )
}

type RouteCtx = { params: Promise<{ id: string }> }

export const GET = withAuth(async (req, user, bouncer, ctx: RouteCtx) => {
  const { id: projectId } = await ctx.params
  const parsed = parseQuery(req, exportQuerySchema)
  if (parsed instanceof Response) return parsed

  const project = await ProjectQueries.get(projectId)
  if (!project) return notFound("Project not found")
  await bouncer.with(CorpusPolicy).authorize("read", project)

  // Mirror the corpus snapshot route: build the filter set only when at least
  // one filter field is present; pass undefined otherwise.
  const typeArr = splitCsv(parsed.type)
  const langArr = splitCsv(parsed.lang)
  const oaArr = splitCsv(parsed.oa)
  const peerArr = splitCsv(parsed.peer)
  const funderArr = splitCsv(parsed.funder)
  const sessionArr = splitCsv(parsed.session)
  const hasFilters =
    typeArr !== undefined ||
    langArr !== undefined ||
    oaArr !== undefined ||
    peerArr !== undefined ||
    funderArr !== undefined ||
    sessionArr !== undefined ||
    parsed.yearFrom !== undefined ||
    parsed.yearTo !== undefined ||
    parsed.undated !== undefined ||
    parsed.q !== undefined

  const filters: CorpusFilterSet | undefined = hasFilters
    ? {
        type: typeArr,
        lang: langArr,
        oa: oaArr,
        peer: peerArr,
        funder: funderArr,
        session: sessionArr,
        yearFrom: parsed.yearFrom,
        yearTo: parsed.yearTo,
        undated: parsed.undated,
        q: parsed.q,
      }
    : undefined

  const versionRef = parsed.version ?? "head"
  const { versionSeq, rows } = await CorpusQueries.exportRows(
    projectId,
    typeof versionRef === "number" ? { seq: versionRef } : versionRef,
    filters,
  )

  const csv = toCsv(
    EXPORT_HEADER,
    rows.map((r) => [
      r.openaireId,
      r.doi,
      r.title,
      r.author,
      r.year,
      r.dateLabel,
      r.docType,
      r.instanceType,
      r.lang,
      r.publisher,
      r.venue,
      openAccessClass(r),
      r.peerReviewed,
      r.citationCount,
      r.funder,
      r.resolveStatus,
      r.doi ? DOI_URL(r.doi) : "",
      OPENAIRE_RECORD_URL(r.openaireId, r.doi),
    ]),
  )

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="corpus-${projectId}-v${versionSeq}.csv"`,
      "Cache-Control": "no-store",
    },
  })
})
