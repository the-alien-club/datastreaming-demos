/**
 * GET /api/projects/:id/figures/:openaireId/:figureId
 *
 * Streams a stored figure image (extracted by the ingest worker via Mistral OCR)
 * from the data-cluster to the browser. The <img> in a rendered research note
 * points here — the cluster bearer token stays server-side.
 *
 * Layer order: withAuth → load project → authorize (corpus read) → resolve +
 * stream the figure. A missing figure answers 404 (never throws).
 *
 * Authorization: project member (read) or admin. Figures are corpus content, so
 * the CorpusPolicy read rule applies.
 */
import { withAuth } from "@/app/api/_middleware"
import { notFound } from "@/lib/api-response"
import { ProjectQueries } from "@/models/projects/queries"
import { CorpusPolicy } from "@/models/corpus/policy"
import { fetchFigureImage } from "@/lib/cluster/figures"

type RouteCtx = {
  params: Promise<{ id: string; openaireId: string; figureId: string }>
}

export const GET = withAuth(async (_req, _user, bouncer, ctx: RouteCtx) => {
  const { id, openaireId, figureId } = await ctx.params

  const project = await ProjectQueries.get(id)
  if (!project) return notFound("Project not found")

  await bouncer.with(CorpusPolicy).authorize("read", project)

  const image = await fetchFigureImage(id, decodeURIComponent(openaireId), figureId)
  if (!image) return notFound("Figure not found")

  return new Response(new Uint8Array(image.bytes), {
    status: 200,
    headers: {
      "content-type": image.contentType,
      // Figures are immutable per ingested version; let the browser cache them.
      "cache-control": "private, max-age=3600",
    },
  })
})
