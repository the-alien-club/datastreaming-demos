CREATE TABLE "agent_subagents" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"name" text NOT NULL,
	"system_prompt" text NOT NULL,
	"model" text DEFAULT 'mistral-small-latest',
	"mcp_ids" text,
	"dataset_id" text,
	"node_id" text,
	"created_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" integer,
	"name" text NOT NULL,
	"description" text,
	"system_prompt" text,
	"steps" text,
	"model" text DEFAULT 'mistral-small-latest',
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"user_id" text,
	"session_id" text,
	"title" text,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" text PRIMARY KEY NOT NULL,
	"cluster_dataset_id" integer,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'pending',
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "mcps" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"server_url" text NOT NULL,
	"transport" text DEFAULT 'streamable_http',
	"auth_token" text,
	"description" text,
	"category" text,
	"enabled" boolean DEFAULT true,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"metadata" text,
	"created_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "specialists" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"system_prompt" text NOT NULL,
	"model" text DEFAULT 'mistral-small-latest',
	"mcp_ids" text,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "agent_subagents" ADD CONSTRAINT "agent_subagents_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;