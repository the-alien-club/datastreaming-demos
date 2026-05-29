import { withAuth } from "@/app/api/_middleware"
import { ok, notFound } from "@/lib/api-response"
import { ConversationPolicy } from "@/models/conversations/policy"
import { getConversationById } from "@/models/conversations/queries"
import { deleteConversation } from "@/models/conversations/service"
import type { ConversationDetailResponse } from "../../_validators"

export const dynamic = "force-dynamic"

export const GET = withAuth(async (_req, _user, bouncer, ctx) => {
  const { id } = await ctx.params
  const conversation = await getConversationById(id)
  if (!conversation) return notFound()
  await bouncer.with(ConversationPolicy).authorize("view", conversation)
  return ok<ConversationDetailResponse>(conversation)
})

export const DELETE = withAuth(async (_req, user, bouncer, ctx) => {
  const { id } = await ctx.params
  const conversation = await getConversationById(id)
  if (!conversation) return notFound()
  await bouncer.with(ConversationPolicy).authorize("delete", conversation)
  await deleteConversation(id, user.id)
  return new Response(null, { status: 204 })
})
