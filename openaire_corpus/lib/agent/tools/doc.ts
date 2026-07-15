/**
 * Document tool definitions for the OpenAIRE research agent.
 *
 * One tool:
 *   - doc_get — fetch a corpus document's full metadata by OpenAIRE id.
 *
 * The document must already be in the project's corpus (i.e. a row exists in
 * the Document table for this projectId × openaireId). Documents outside the
 * corpus return a structured error; the agent must not fabricate ids.
 */
import "server-only"

import { z } from "zod"
import { defineTool } from "@alien/chat-sdk/claude"
import { prisma } from "@/lib/db"
import type { TurnScopedCtx } from "./registry-factory"
import { AGENT_TOOLS } from "./constants"

// ---------------------------------------------------------------------------
// doc_get
// ---------------------------------------------------------------------------

export const docGetTool = defineTool<
  z.ZodObject<{ openaire_id: z.ZodString }>,
  TurnScopedCtx
>({
  name: AGENT_TOOLS.docGet,
  description:
    "Fetch a corpus document's metadata (title, authors, year, type, language, " +
    "publisher, venue, abstract, DOI, open-access status, citation count) by its " +
    "OpenAIRE id. Only documents already in this project's corpus can be " +
    "retrieved — pass an id from rag_query results or the user's reference. " +
    "Returns an error if the id is not in the corpus.",
  inputSchema: z.object({
    openaire_id: z
      .string()
      .describe(
        'The OpenAIRE id (e.g. "doi_dedup___::<hash>"). Never fabricate or alter an id.',
      ),
  }),
  handler: async (input, ctx) => {
    const doc = await prisma.document.findUnique({
      where: {
        projectId_openaireId: { projectId: ctx.projectId, openaireId: input.openaire_id },
      },
    })

    if (!doc) {
      return {
        error: "id_not_in_corpus",
        openaireId: input.openaire_id,
        message:
          "This document is not part of this project's corpus. Only documents in " +
          "the indexed corpus are accessible via doc_get.",
      }
    }

    return { document: doc }
  },
})

// Convenience array for the registry builder.
export const docTools = [docGetTool] as const
