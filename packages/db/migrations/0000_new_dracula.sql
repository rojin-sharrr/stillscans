CREATE TABLE `checks` (
	`id` text PRIMARY KEY NOT NULL,
	`input_hash` text NOT NULL,
	`result` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `checks_input_hash_idx` ON `checks` (`input_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `checks_created_at_idx` ON `checks` (`created_at`);--> statement-breakpoint
CREATE TABLE `code_destinations` (
	`id` text PRIMARY KEY NOT NULL,
	`code_id` text NOT NULL,
	`destination` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`code_id`) REFERENCES `codes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `code_destinations_code_id_idx` ON `code_destinations` (`code_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `codes` (
	`id` text PRIMARY KEY NOT NULL,
	`short_code` text NOT NULL,
	`user_id` text NOT NULL,
	`label` text,
	`destination` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`synced_version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `codes_short_code_unique` ON `codes` (`short_code`);--> statement-breakpoint
CREATE INDEX `codes_user_id_idx` ON `codes` (`user_id`);--> statement-breakpoint
CREATE INDEX `codes_sync_idx` ON `codes` (`synced_version`,`version`);--> statement-breakpoint
CREATE TABLE `provider_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_slug` text,
	`domain` text,
	`message` text NOT NULL,
	`email` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scans` (
	`id` text PRIMARY KEY NOT NULL,
	`short_code` text NOT NULL,
	`scanned_at` integer NOT NULL,
	`country` text,
	`city` text,
	`device_type` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scans_short_code_idx` ON `scans` (`short_code`,`scanned_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `unknown_domains` (
	`domain` text PRIMARY KEY NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`count` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code_allowance` integer DEFAULT 3 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);