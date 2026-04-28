ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "datasets" ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT false NOT NULL;
