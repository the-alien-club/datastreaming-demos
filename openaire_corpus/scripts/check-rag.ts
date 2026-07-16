// scripts/check-rag.ts
// Live smoke check of the research RAG path against the ingested corpus: proves
// lib/cluster/real-rag.ts → the app's configured datacluster MCP reaches the
// project's dataset (cluster 111) and returns openaireId/locator passages, and
// that lib/cluster/figures.listFigures resolves a document's figures.
// Run: npx tsx --env-file .env.local --conditions react-server scripts/check-rag.ts <projectId> <ingestedVersionId>
import { ClusterRagClient } from "@/lib/cluster/rag"
import { listFigures } from "@/lib/cluster/figures"

async function main() {
  const projectId = process.argv[2]
  const ingestedVersionId = process.argv[3]
  if (!projectId || !ingestedVersionId) throw new Error("usage: check-rag <projectId> <ingestedVersionId>")

  console.log(`[1] rag_query "CRISPR off-target specificity seed region" …`)
  const res = await ClusterRagClient.query({
    projectId,
    ingestedVersionId,
    query: "CRISPR Cas9 off-target specificity seed region mismatch",
    k: 5,
  })
  console.log(`    model=${res.modelVersion} total=${res.total} passages=${res.passages.length}`)
  for (const p of res.passages.slice(0, 5)) {
    console.log(
      `    - score ${p.score.toFixed(3)} | ${p.openaireId} | ${p.locator ?? "(no locator)"} | ${(
        p.title ?? ""
      ).slice(0, 50)} | "${p.snippet.slice(0, 70)}…"`,
    )
  }
  if (res.passages.length === 0) throw new Error("rag_query returned 0 passages — RAG path not reaching the dataset")

  const withFig = res.passages.find((p) => p.openaireId)
  if (withFig) {
    console.log(`[2] listFigures(${withFig.openaireId}) …`)
    const figs = await listFigures(projectId, withFig.openaireId)
    console.log(`    → ${figs.length} figures`, figs.slice(0, 3).map((f) => `${f.id}${f.caption ? ":" + f.caption.slice(0, 30) : ""}`))
  }
  console.log("\n✅ RAG path live-verified.")
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e)
  process.exit(1)
})
