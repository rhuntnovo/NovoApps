CREATE TABLE `cms_media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`module_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`course_id` text NOT NULL,
	`locale` text NOT NULL,
	`page_id` text NOT NULL,
	`block_id` text NOT NULL,
	`path` text NOT NULL,
	`storage_key` text NOT NULL,
	`content_type` text NOT NULL,
	`bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`source` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`module_id`) REFERENCES `cms_modules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_media_assets_path_unique` ON `cms_media_assets` (`path`);--> statement-breakpoint
CREATE UNIQUE INDEX `cms_media_assets_storage_key_unique` ON `cms_media_assets` (`storage_key`);--> statement-breakpoint
CREATE INDEX `cms_media_module` ON `cms_media_assets` (`module_id`);--> statement-breakpoint
CREATE TABLE `cms_publication_leases` (
	`module_id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`module_id`) REFERENCES `cms_modules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `cms_publications` (
	`id` text PRIMARY KEY NOT NULL,
	`module_id` text NOT NULL,
	`status` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	`pointer_key` text NOT NULL,
	`error` text,
	FOREIGN KEY (`module_id`) REFERENCES `cms_modules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cms_publication_module` ON `cms_publications` (`module_id`,`created_at`);