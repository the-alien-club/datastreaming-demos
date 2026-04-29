ALTER TABLE "agent_subagents" ALTER COLUMN "model" SET DEFAULT 'mistral-large-2512';--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "model" SET DEFAULT 'mistral-large-2512';--> statement-breakpoint
ALTER TABLE "specialists" ALTER COLUMN "model" SET DEFAULT 'mistral-large-2512';--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "starter_prompts" text;