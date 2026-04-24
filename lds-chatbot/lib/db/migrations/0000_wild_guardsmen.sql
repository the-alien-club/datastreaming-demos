CREATE TABLE `agent_subagents` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`name` text NOT NULL,
	`system_prompt` text NOT NULL,
	`model` text DEFAULT 'mistral-small-latest',
	`mcp_ids` text,
	`dataset_id` text,
	`node_id` text,
	`created_at` integer,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`system_prompt` text,
	`steps` text,
	`model` text DEFAULT 'mistral-small-latest',
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`session_id` text,
	`title` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `datasets` (
	`id` text PRIMARY KEY NOT NULL,
	`cluster_dataset_id` integer,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'pending',
	`agent_id` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`metadata` text,
	`created_at` integer,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
