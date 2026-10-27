CREATE TABLE `alert_deliveries` (
	`watch_id` text NOT NULL,
	`observation_id` text NOT NULL,
	`observed_at` integer NOT NULL,
	PRIMARY KEY(`watch_id`, `observation_id`),
	FOREIGN KEY (`watch_id`) REFERENCES `alert_watches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `alert_deliveries_observed` ON `alert_deliveries` (`observed_at`);--> statement-breakpoint
CREATE TABLE `alert_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `alert_rate_limits_expiry` ON `alert_rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `alert_watches` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`endpoint_hash` text NOT NULL,
	`payload_ciphertext` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_checked_at` integer,
	`lease_token` text,
	`lease_until` integer,
	`next_attempt_at` integer,
	`failure_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alert_watches_endpoint` ON `alert_watches` (`endpoint_hash`);--> statement-breakpoint
CREATE INDEX `alert_watches_expiry` ON `alert_watches` (`expires_at`);