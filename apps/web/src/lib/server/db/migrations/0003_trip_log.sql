CREATE TABLE `trip` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`distance_km` real NOT NULL,
	`start_odometer_km` real,
	`end_odometer_km` real,
	`start_soc_pct` real,
	`end_soc_pct` real,
	`start_latitude` real,
	`start_longitude` real,
	`end_latitude` real,
	`end_longitude` real,
	`start_address` text,
	`end_address` text,
	`gap` integer DEFAULT false NOT NULL,
	`purpose` text,
	`note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `vehicle_connection`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trip_connection_start_idx` ON `trip` (`connection_id`,`start_at`);