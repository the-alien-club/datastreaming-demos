PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agents` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` integer,
	`name` text NOT NULL,
	`description` text,
	`system_prompt` text,
	`steps` text,
	`model` text DEFAULT 'mistral-small-latest',
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_agents`("id", "workflow_id", "name", "description", "system_prompt", "steps", "model", "created_at", "updated_at") SELECT "id", "workflow_id", "name", "description", "system_prompt", "steps", "model", "created_at", "updated_at" FROM `agents`;--> statement-breakpoint
DROP TABLE `agents`;--> statement-breakpoint
ALTER TABLE `__new_agents` RENAME TO `agents`;--> statement-breakpoint
PRAGMA foreign_keys=ON;