CREATE TABLE `specialists` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`system_prompt` text NOT NULL,
	`model` text DEFAULT 'mistral-small-latest',
	`mcp_ids` text,
	`created_at` integer,
	`updated_at` integer
);