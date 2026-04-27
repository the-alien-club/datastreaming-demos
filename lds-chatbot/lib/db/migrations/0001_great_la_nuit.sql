ALTER TABLE "agent_subagents" ALTER COLUMN "model" SET DEFAULT 'gpt-4.1-mini';--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "model" SET DEFAULT 'gpt-4.1-mini';--> statement-breakpoint
ALTER TABLE "specialists" ALTER COLUMN "model" SET DEFAULT 'gpt-4.1-mini';--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "starter_prompts" text;