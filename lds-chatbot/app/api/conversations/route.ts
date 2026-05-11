import { withAuth } from "@/app/api/_middleware"
import { getConversations } from "@/models/conversations/service"
import { ok } from "@/lib/api-response"
import type { ConversationListItem } from "../_validators"

export const dynamic = "force-dynamic"

/**
 * GET /api/conversations
 *
 * Returns all conversations belonging to the authenticated user, most-
 * recently-updated first, with agent name and message count. No resource-
 * level authorization is needed — the list is always scoped to the caller.
 */
export const GET = withAuth(async (_req, user) => {
  const rows = await getConversations(user.id)
  return ok<ConversationListItem[]>(rows)
})
