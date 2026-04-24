CREATE TABLE `mcps` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`server_url` text NOT NULL,
	`transport` text DEFAULT 'streamable_http',
	`auth_token` text,
	`description` text,
	`enabled` integer DEFAULT 1,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
INSERT INTO `mcps` (`id`, `name`, `server_url`, `transport`, `auth_token`, `enabled`) VALUES
	('datacluster', 'Data Cluster', 'https://mcp.alien.club/datacluster/mcp', 'streamable_http', NULL, 1),
	('biorxiv', 'BioRxiv', 'https://mcp.alien.club/biorxiv/mcp', 'streamable_http', NULL, 1),
	('openaire', 'OpenAIRE', 'https://mcp.alien.club/openaire/mcp', 'streamable_http', NULL, 1),
	('goodlegal', 'GoodLegal', 'https://goodlegal-french-law-api.zachariekhan1.repl.co/goodlegal/mcp', 'streamable_http', 'PKjoaRYIEXi6O8sa42WJ-I4b-ZThjbLdP-kxt9UrgnY', 1);
