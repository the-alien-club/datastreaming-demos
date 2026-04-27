-- Persist the full AI-SDK `UIMessage.parts` array per assistant message so
-- the chat UI can replay the rich stream (text, tool-call chips, subagent
-- panels, …) on a tab refresh — instead of collapsing to plain text. The
-- column is nullable on purpose: legacy rows have no parts, and the chat
-- UI falls back to rendering `content` when `parts IS NULL`.
ALTER TABLE "messages" ADD COLUMN "parts" jsonb;
