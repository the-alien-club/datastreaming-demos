ALTER TABLE "agent_subagents" ADD COLUMN IF NOT EXISTS "node_id" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "datasets" ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT false NOT NULL;