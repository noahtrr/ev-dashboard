CREATE TABLE `provider_oauth_state` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `provider_oauth_state_user_id_idx` ON `provider_oauth_state` (`user_id`);--> statement-breakpoint
CREATE TABLE `snapshot` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`connection_id` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`data` text NOT NULL,
	`raw` text NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `vehicle_connection`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `snapshot_connection_fetched_idx` ON `snapshot` (`connection_id`,`fetched_at`);--> statement-breakpoint
CREATE INDEX `snapshot_fetched_at_idx` ON `snapshot` (`fetched_at`);--> statement-breakpoint
CREATE TABLE `vehicle_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`label` text,
	`external_id` text,
	`access_token` text NOT NULL,
	`refresh_token` text,
	`access_token_expires_at` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_success_at` integer,
	`last_attempt_at` integer,
	`last_error_at` integer,
	`last_error` text,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`next_poll_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vehicle_connection_user_id_idx` ON `vehicle_connection` (`user_id`);