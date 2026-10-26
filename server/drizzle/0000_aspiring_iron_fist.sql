CREATE TABLE `operations_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `operations_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operations_devices_token` ON `operations_devices` (`token_hash`);--> statement-breakpoint
CREATE INDEX `operations_devices_session` ON `operations_devices` (`session_id`);--> statement-breakpoint
CREATE TABLE `operations_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `operations_rate_limits_expiry` ON `operations_rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `operations_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`admin_hash` text NOT NULL,
	`viewer_hash` text NOT NULL,
	`publisher_hash` text NOT NULL,
	`invite_hash` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `operations_sessions_expiry` ON `operations_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `operations_units` (
	`session_id` text NOT NULL,
	`id` text NOT NULL,
	`owner_device_id` text,
	`payload_json` text NOT NULL,
	`observed_at` integer,
	`observation_key` text,
	PRIMARY KEY(`session_id`, `id`),
	FOREIGN KEY (`session_id`) REFERENCES `operations_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_device_id`) REFERENCES `operations_devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `operations_units_observed` ON `operations_units` (`observed_at`);