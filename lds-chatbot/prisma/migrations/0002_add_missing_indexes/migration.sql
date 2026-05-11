-- Add indexes that exist in prisma/schema.prisma but were never created
-- by the old Drizzle migrations. The baseline migration (0001_baseline)
-- was resolved without executing SQL, so production is missing these.

CREATE INDEX IF NOT EXISTS "agents_user_id_idx" ON "agents"("user_id");
CREATE INDEX IF NOT EXISTS "agent_subagents_agent_id_idx" ON "agent_subagents"("agent_id");
CREATE INDEX IF NOT EXISTS "conversations_agent_id_idx" ON "conversations"("agent_id");
CREATE INDEX IF NOT EXISTS "conversations_user_id_idx" ON "conversations"("user_id");
CREATE INDEX IF NOT EXISTS "messages_conversation_id_idx" ON "messages"("conversation_id");
CREATE INDEX IF NOT EXISTS "datasets_user_id_idx" ON "datasets"("user_id");
CREATE INDEX IF NOT EXISTS "mcps_user_id_idx" ON "mcps"("user_id");
CREATE INDEX IF NOT EXISTS "specialists_user_id_idx" ON "specialists"("user_id");
