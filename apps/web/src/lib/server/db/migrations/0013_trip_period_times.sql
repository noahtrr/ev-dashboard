ALTER TABLE `trip_period` ADD `mode` text DEFAULT 'range' NOT NULL;--> statement-breakpoint
ALTER TABLE `trip_period` ADD `from_minute` integer;--> statement-breakpoint
ALTER TABLE `trip_period` ADD `to_minute` integer;--> statement-breakpoint
ALTER TABLE `trip_period` ADD `time_zone` text;