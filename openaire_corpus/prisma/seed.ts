/**
 * prisma/seed.ts — BnF Corpus Research dev database seed.
 *
 * Run via:  npx prisma db seed
 * Which executes: tsx --conditions react-server prisma/seed.ts
 *   (--conditions react-server makes `server-only` resolve to the empty shim
 *   so we can import service modules that guard against client bundling.)
 *
 * Required environment variables (via .env.local, loaded by prisma.config.ts):
 *   DATABASE_URL       — Postgres connection string
 *   BETTER_AUTH_SECRET — ≥ 32-char secret for better-auth token signing
 *   BETTER_AUTH_URL    — e.g. http://localhost:3000
 *   ANTHROPIC_API_KEY  — required by lib/env.ts at import time (even though
 *                        the seed itself never calls the Anthropic API)
 *
 * Idempotent: re-running produces no duplicates and no errors.
 *
 * What it does:
 *   1. Ensures dev user leo@alien.club exists (via auth.api.signUpEmail).
 *   2. Ensures Project A "CRISPR-Cas9 Off-Target Effects" exists (ProjectService.create).
 *   3. Upserts 30 hand-picked documents from the prototype SEED data.
 *   4. Adds all 30 ARKs to the corpus (CorpusService.addArks → head seq=2).
 *   5. Removes the first ARK (CorpusService.removeArks → head seq=3).
 *      The Document row is NOT deleted — membership change only (invariant).
 *   6. Ensures Project B "Brouillon" exists, empty (head stays seq=1).
 *   7. Prints a summary with project URLs and corpus counts.
 */

// NOTE: .env.local is loaded by the tsx --env-file-if-exists flag configured
// in prisma.config.ts migrations.seed. Environment variables are therefore
// available before any module initialisation (ESM imports are hoisted and
// execute before user code, so a dotenv.config() call inside the script body
// would be too late for lib/env.ts and lib/db.ts).

import { auth } from "@/lib/auth"
import { UserQueries } from "@/models/users/queries"
import { ProjectQueries } from "@/models/projects/queries"
import { ProjectService } from "@/models/projects/service"
import { DocumentService } from "@/models/documents/service"
import { CorpusService } from "@/models/corpus/service"
import { prisma } from "@/lib/db"

// ---------------------------------------------------------------------------
// Seed document data — a small OpenAIRE research-product set (the design's
// CRISPR-Cas9 off-target demo). Keyed by OpenAIRE id; DOI + rich metadata are
// carried so the rows are born "resolved" (DocumentService.upsertMany). Ids
// contain "::" so CorpusService.addIds treats them as OpenAIRE ids and does NOT
// hit the MCP to canonicalize (seed runs without network).
// ---------------------------------------------------------------------------
const SEED_DOCS = [
  {
    openaireId: "doi_dedup___::4438c68689732d387c9e2a491f5623a5",
    doi: "10.1007/978-1-0716-1979-7_19",
    title:
      "Identification and Validation of CRISPR/Cas9 Off-Target Activity in Hematopoietic Stem and Progenitor Cells",
    author: "Park S.H., et al.",
    year: 2022,
    docType: "publication",
    instanceType: "book",
    lang: "en",
    publisher: "Springer US",
    venue: "Methods in Molecular Biology",
    abstract:
      "Targeted genome editing in hematopoietic stem and progenitor cells (HSPCs) using CRISPR/Cas9 can potentially provide a permanent cure for hematologic diseases. However, the utility of CRISPR/Cas9 systems for therapeutic genome editing can be compromised by their off-target effects…",
    openAccessColor: null,
    isGreen: false,
    bestAccessRight: "CLOSED",
    peerReviewed: true,
    citationCount: 2,
    influenceClass: "C5",
  },
  {
    openaireId: "doi_dedup___::045f0f6a257cf1c9df50904abab9558d",
    doi: "10.1016/s2095-3119(19)62744-9",
    title:
      "Truncated gRNA reduces CRISPR/Cas9-mediated off-target rate for MSTN gene knockout in bovines",
    author: "Zhou Z.-W., et al.",
    year: 2019,
    docType: "publication",
    instanceType: "article",
    lang: "en",
    publisher: "Elsevier BV",
    venue: "Journal of Integrative Agriculture",
    abstract:
      "The CRISPR/Cas9 mediates efficient gene editing but has off-target effects inconducive to animal breeding. In this study, the efficacy of CRISPR/Cas9 vectors containing different lengths of gRNA in reduction of the off-target phenomenon in the bovine MSTN gene knockout fibroblast cell lines was assessed…",
    openAccessColor: "gold",
    isGreen: false,
    bestAccessRight: "OPEN",
    peerReviewed: true,
    citationCount: 7,
    influenceClass: "C5",
  },
  {
    openaireId: "doi_dedup___::0aa19de8b88d1527a0c758097cbbb75f",
    doi: "10.1038/nbt.2647",
    title:
      "DNA targeting specificity of RNA-guided Cas9 nucleases",
    author: "Hsu P.D., et al.",
    year: 2013,
    docType: "publication",
    instanceType: "article",
    lang: "en",
    publisher: "Nature Publishing Group",
    venue: "Nature Biotechnology",
    abstract:
      "The RNA-guided Cas9 nuclease from the Streptococcus pyogenes type II CRISPR system can be used to facilitate efficient genome engineering… We characterize the off-target effects of Cas9 across a genome-wide scale.",
    openAccessColor: "hybrid",
    isGreen: true,
    bestAccessRight: "OPEN",
    peerReviewed: true,
    citationCount: 4180,
    influenceClass: "C1",
  },
] as const

// ---------------------------------------------------------------------------
// Helper: is this error a better-auth "email already taken" response?
//
// better-auth throws an APIError (from better-call) with:
//   err.body.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
//   err.status  === "UNPROCESSABLE_ENTITY"
//
// We catch ONLY this case. Every other error propagates — per
// CLAUDE_ERROR_PATTERNS.md: "catch-all exceptions without re-raising" is
// a forbidden pattern.
// ---------------------------------------------------------------------------
function isEmailAlreadyExistsError(err: unknown): boolean {
  if (err === null || typeof err !== "object") return false
  const e = err as Record<string, unknown>

  // Primary: check the body.code field that better-auth sets
  if (
    typeof e["body"] === "object" &&
    e["body"] !== null &&
    (e["body"] as Record<string, unknown>)["code"] ===
      "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
  ) {
    return true
  }

  // Fallback: status string check (belt-and-suspenders, same error)
  if (e["status"] === "UNPROCESSABLE_ENTITY") {
    return true
  }

  return false
}

// ---------------------------------------------------------------------------
// Main seed
// ---------------------------------------------------------------------------
async function seed(): Promise<void> {
  console.log("=== OpenAIRE seed: starting ===")

  // -------------------------------------------------------------------------
  // Step 1 — Dev user
  // -------------------------------------------------------------------------
  console.log("Step 1: ensuring dev user leo@alien.club …")

  // Try to create the user via the same auth path the sign-up UI uses.
  try {
    // Password must meet better-auth's minimum length (default: 8 chars).
    // "dev-local" is clearly non-production and easy to remember.
    await auth.api.signUpEmail({
      body: {
        email: "leo@alien.club",
        password: "dev-local",
        name: "Leo",
      },
    })
    console.log("  ✓ Dev user created")
  } catch (err: unknown) {
    if (isEmailAlreadyExistsError(err)) {
      console.log("  ✓ Dev user already exists — skipping creation")
    } else {
      // Any other error is genuinely unexpected — propagate.
      throw err
    }
  }

  // Load the user record so we have the id for downstream service calls.
  const devUser = await UserQueries.getByEmail("leo@alien.club")
  if (!devUser) {
    throw new Error(
      "Dev user leo@alien.club not found after creation — database inconsistency",
    )
  }
  console.log(`  userId = ${devUser.id}`)

  // -------------------------------------------------------------------------
  // Step 2 — Project A (populated)
  // Idempotent: skip if a project with this name already exists for this owner.
  // -------------------------------------------------------------------------
  const PROJECT_A_NAME = "CRISPR-Cas9 Off-Target Effects"
  const PROJECT_B_NAME = "Draft"

  console.log(`Step 2: ensuring project "${PROJECT_A_NAME}" …`)

  const existingProjects = await ProjectQueries.listForOwner(devUser.id)
  let projectA = existingProjects.find((p) => p.name === PROJECT_A_NAME) ?? null
  let projectAIsNew = false

  if (!projectA) {
    projectA = await ProjectService.create({
      name: PROJECT_A_NAME,
      subtitle: "Literature corpus · CRISPR off-target",
      ownerId: devUser.id,
    })
    projectAIsNew = true
    console.log(`  ✓ Project A created (id=${projectA.id})`)
  } else {
    console.log(`  ✓ Project A already exists (id=${projectA.id}) — skipping creation`)
  }

  // -------------------------------------------------------------------------
  // Steps 3–5 only run when the project was just created.
  //
  // Rationale: the corpus mutation codepath (advanceVersion) is not idempotent
  // across seed runs on an already-populated project.
  //
  // On first run (new project): executes the real codepath, producing seq=3.
  // On subsequent runs (existing project): skips to preserve DB state.
  // -------------------------------------------------------------------------
  if (projectAIsNew) {
    // Step 3 — Upsert documents (born "resolved" with full metadata).
    console.log(`Step 3: upserting ${SEED_DOCS.length} documents …`)

    const docsToInsert = SEED_DOCS.map((d) => ({ ...d }))

    await DocumentService.upsertMany(projectA.id, docsToInsert)
    console.log(`  ✓ ${SEED_DOCS.length} document rows upserted`)

    // Step 4 — Add all ids to the corpus via the real codepath.
    // Exercises advanceVersion() → head advances from seq=1 to seq=2.
    console.log("Step 4: adding all ids to corpus via CorpusService.addIds …")

    const allIds = SEED_DOCS.map((d) => d.openaireId)

    const addResult = await CorpusService.addIds(projectA, devUser, {
      ids: allIds,
      reason: "seed",
    })
    console.log(
      `  ✓ addIds complete — head seq=${addResult.versionSeq}, total=${addResult.total}, +${addResult.lastDeltaAdded}`,
    )

    // Step 5 — Remove the first id (regression test for removeIds + diff).
    // Head advances from seq=2 to seq=3. The Document row stays.
    console.log("Step 5: removing first id via CorpusService.removeIds …")

    const removedId = SEED_DOCS[0].openaireId
    const removeResult = await CorpusService.removeIds(projectA, devUser, {
      ids: [removedId],
      reason: "seed-remove-test",
    })
    console.log(
      `  ✓ removeIds complete — head seq=${removeResult.versionSeq}, total=${removeResult.total}, -${removeResult.lastDeltaRemoved}`,
    )
  } else {
    console.log("Steps 3–5: skipped (project A already exists — corpus state preserved)")
  }

  // -------------------------------------------------------------------------
  // Step 6 — Project B (empty, for empty-state UI testing)
  // -------------------------------------------------------------------------
  console.log(`Step 6: ensuring project "${PROJECT_B_NAME}" …`)

  let projectB = existingProjects.find((p) => p.name === PROJECT_B_NAME) ?? null

  if (!projectB) {
    projectB = await ProjectService.create({
      name: PROJECT_B_NAME,
      subtitle: "Empty corpus for testing",
      ownerId: devUser.id,
    })
    console.log(`  ✓ Project B created (id=${projectB.id})`)
  } else {
    console.log(`  ✓ Project B already exists (id=${projectB.id}) — skipping creation`)
  }

  // -------------------------------------------------------------------------
  // Step 7 — Fetch final state for the summary print
  // -------------------------------------------------------------------------
  const projectAFinal = await prisma.project.findUniqueOrThrow({
    where: { id: projectA.id },
    select: { headVersionId: true },
  })
  const projectBFinal = await prisma.project.findUniqueOrThrow({
    where: { id: projectB.id },
    select: { headVersionId: true },
  })

  const headA = await prisma.corpusVersion.findFirstOrThrow({
    where: { id: projectAFinal.headVersionId! },
    select: { seq: true, status: true },
  })
  const headB = await prisma.corpusVersion.findFirstOrThrow({
    where: { id: projectBFinal.headVersionId! },
    select: { seq: true, status: true },
  })

  const membershipCountA = await prisma.corpusMembership.count({
    where: { versionId: projectAFinal.headVersionId! },
  })
  const docCountA = await prisma.document.count({
    where: { projectId: projectA.id },
  })

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("")
  console.log("=== BnF seed: complete ===")
  console.log("")
  console.log("Dev user:  leo@alien.club  /  password: dev-local")
  console.log("")
  console.log(`Project A: "${PROJECT_A_NAME}" (id=${projectA.id})`)
  console.log(`  URL:  http://localhost:3000/projects/${projectA.id}/constituer`)
  console.log(`  Head: seq=${headA.seq}, status=${headA.status}`)
  console.log(`  Corpus membership (head): ${membershipCountA} ARKs`)
  console.log(`  Document rows (project): ${docCountA} (includes removed-ARK row)`)
  console.log("")
  console.log(`Project B: "${PROJECT_B_NAME}" (id=${projectB.id})`)
  console.log(`  Head: seq=${headB.seq}, status=${headB.status}`)
  console.log(`  Corpus membership (head): 0 ARKs`)
  console.log("")
  console.log("Validation queries:")
  console.log(
    `  SELECT seq, status FROM corpus_version WHERE project_id = '${projectA.id}' ORDER BY seq;`,
  )
  console.log(
    `  SELECT count(*) FROM corpus_membership WHERE version_id = (SELECT head_version_id FROM project WHERE id = '${projectA.id}');`,
  )
  console.log(
    `  SELECT count(*) FROM document WHERE project_id = '${projectA.id}';`,
  )
}

seed()
  .then(() => {
    process.exit(0)
  })
  .catch((err: unknown) => {
    console.error("Seed failed:", err)
    process.exit(1)
  })
