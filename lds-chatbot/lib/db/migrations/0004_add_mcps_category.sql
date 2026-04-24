ALTER TABLE `mcps` ADD COLUMN `category` text;
--> statement-breakpoint
UPDATE `mcps` SET `category` = 'data' WHERE `id` = 'datacluster';
--> statement-breakpoint
UPDATE `mcps` SET `category` = 'research' WHERE `id` IN ('biorxiv', 'openaire');
--> statement-breakpoint
UPDATE `mcps` SET `category` = 'legal' WHERE `id` = 'goodlegal';
