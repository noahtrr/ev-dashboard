CREATE TABLE `trip_period` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`from_day` text NOT NULL,
	`to_day` text NOT NULL,
	`from_at` integer NOT NULL,
	`to_at` integer NOT NULL,
	`purpose` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `vehicle_connection`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `trip_period_connection_idx` ON `trip_period` (`connection_id`,`from_at`);--> statement-breakpoint
ALTER TABLE `trip` ADD `manual` integer DEFAULT false NOT NULL;