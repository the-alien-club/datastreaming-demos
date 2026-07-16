// scripts/check-openaire-mcp.ts
// Live smoke check of the OpenAIRE MCP client + normalizer against the hosted
// endpoint. Proves lib/openaire/client.ts (resolveDoi + resolveIds) and
// lib/mcp/normalize.ts map a real Graph product into our Document shape.
// Run: npx tsx --env-file .env.local --conditions react-server scripts/check-openaire-mcp.ts
import { OpenaireClient } from "@/lib/openaire/client"
import { normalizeDocument } from "@/lib/mcp/normalize"

async function main() {
  const client = new OpenaireClient()
  const doi = "10.1038/nbt.2647" // Hsu et al. 2013 — DNA targeting specificity of RNA-guided Cas9

  console.log(`[1] resolveDoi(${doi}) …`)
  const id = await client.resolveDoi(doi)
  console.log("    → openaireId:", id)
  if (!id) throw new Error("resolveDoi returned null")

  console.log(`[2] resolveIds([${id}]) …`)
  const [result] = await client.resolveIds([id])
  if (!result.ok) throw new Error(`resolveIds failed: ${String(result.error)}`)

  const doc = normalizeDocument(result.product)
  if (!doc) throw new Error("normalizeDocument dropped the product")

  console.log("[3] normalized Document:")
  console.log(
    JSON.stringify(
      {
        openaireId: doc.openaireId,
        doi: doc.doi,
        title: doc.title,
        author: doc.author,
        year: doc.year,
        docType: doc.docType,
        instanceType: doc.instanceType,
        venue: doc.venue,
        publisher: doc.publisher,
        openAccessColor: doc.openAccessColor,
        isGreen: doc.isGreen,
        bestAccessRight: doc.bestAccessRight,
        peerReviewed: doc.peerReviewed,
        citationCount: doc.citationCount,
        influenceClass: doc.influenceClass,
        abstract: doc.abstract ? `${doc.abstract.slice(0, 120)}…` : null,
        fulltextUrl: doc.fulltextUrl,
      },
      null,
      2,
    ),
  )
  console.log("\n✓ OpenAIRE MCP client + normalizer work against the live endpoint")
}

main().catch((err: unknown) => {
  console.error("✗ check failed:", err)
  process.exit(1)
})
