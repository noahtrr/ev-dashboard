CREATE TABLE `charge_session` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`start_soc_pct` real,
	`end_soc_pct` real,
	`latitude` real,
	`longitude` real,
	`price_ct_per_kwh` real,
	`cost_eur` real,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `vehicle_connection`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `charge_session_connection_start_idx` ON `charge_session` (`connection_id`,`start_at`);--> statement-breakpoint
CREATE TABLE `electricity_price` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`kind` text NOT NULL,
	`valid_from` text NOT NULL,
	`ct_per_kwh` real NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `vehicle_connection`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `electricity_price_connection_kind_from_idx` ON `electricity_price` (`connection_id`,`kind`,`valid_from`);--> statement-breakpoint
ALTER TABLE `vehicle_connection` ADD `home_latitude` real;--> statement-breakpoint
ALTER TABLE `vehicle_connection` ADD `home_longitude` real;--> statement-breakpoint
ALTER TABLE `vehicle_connection` ADD `charging_loss_pct` real;