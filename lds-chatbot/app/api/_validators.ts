// Barrel: re-exports every Zod schema and response type that was previously
// defined here, now sourced from `models/*/types.ts`.
//
// Route files continue to import from this path unchanged — all names are
// preserved. The only infrastructure that genuinely belongs here,
// `parseBody()`, remains defined below.
//
// Per `CLAUDE_ERROR_PATTERNS.md §1`: never call `req.json()` and key into
// the result without going through `parseBody`.

import { z } from "zod"
import { badRequest } from "@/lib/api-response"

// ── Infrastructure ─────────────────────────────────────────────────────────

/**
 * Read and validate a JSON request body. Returns the parsed value on
 * success or a `Response` with the right HTTP status on failure — caller
 * forwards it directly:
 *
 *   const parsed = await parseBody(request, mySchema)
 *   if (parsed instanceof Response) return parsed
 *   const body = parsed
 */
export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<z.infer<T> | Response> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return badRequest("Invalid JSON body")
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    // 400 (not 422) for shape errors: the body is malformed at the
    // schema level. We use the same status across every internal route
    // for consistency — the frontend reads `error` + optional `issues`
    // regardless of whether the failure is missing-field or wrong-type.
    return badRequest("Validation failed", result.error.flatten())
  }
  return result.data
}

// ── Agents ─────────────────────────────────────────────────────────────────

export {
  stepSchema,
  subagentConfigSchema,
  // Old names kept for backward compatibility with existing route imports.
  createAgentSchema as createAgentBodySchema,
  updateAgentSchema as updateAgentBodySchema,
  subagentCreateSchema as subagentCreateBodySchema,
  subagentDeleteSchema as subagentDeleteBodySchema,
  patchAgentVisibilitySchema as patchVisibilityBodySchema,
  forkAgentSchema as forkAgentBodySchema,
  // Response types
  type AgentRow,
  type SubagentRow,
  type AgentResponse,
  type AgentPublicResponse,
  type AgentListResponse,
  type AgentConversationListItem,
  type SubagentResponse,
  type ForkAgentBody,
  type ForkAgentResponse,
} from "@/models/agents/types"

// ── Conversations & chat ────────────────────────────────────────────────────

export {
  chatSchema as chatBodySchema,
  cancelSchema as cancelBodySchema,
  resumeSchema as resumeBodySchema,
  // Response types
  type ChatRequestBody,
  type ConversationRow,
  type MessageRow,
  type ConversationListItem,
  type ConversationDetailResponse,
  type CancelResponse,
} from "@/models/conversations/types"

// ── Datasets ───────────────────────────────────────────────────────────────

export {
  createDatasetSchema as createDatasetBodySchema,
  updateDatasetSchema as updateDatasetBodySchema,
  datasetAttachSchema as datasetAttachBodySchema,
  STATUS_KEYS,
  // Response types
  type DatasetRow,
  type DatasetListItem,
  type DatasetListResponse,
  type DatasetDetailResponse,
  type DatasetAttachResponse,
  type StatusKey,
  type Overall,
  type DatasetStatusResponse,
  type EntryResponse,
} from "@/models/datasets/types"

// ── MCPs ───────────────────────────────────────────────────────────────────

export {
  createMcpBodySchema,
  updateMcpBodySchema,
  // Response types
  type McpRow,
  type McpResponse,
  type McpListResponse,
  type AvailableMcp,
  type AvailableMcpsResponse,
} from "@/models/mcps/types"

// ── Specialists ────────────────────────────────────────────────────────────

export {
  specialistBodySchema,
  forkSpecialistSchema as forkSpecialistBodySchema,
  // Response types
  type SpecialistRow,
  type SpecialistResponse,
  type SpecialistListResponse,
  type ForkSpecialistBody,
  type ForkSpecialistResponse,
} from "@/models/specialists/types"

// ── AI Models ──────────────────────────────────────────────────────────────

export type { AiModelResponse } from "@/models/ai-models/types"
