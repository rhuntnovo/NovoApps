CREATE TABLE `cms_courses` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_id` text NOT NULL,
	`locale` text NOT NULL,
	`metadata_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_course_locale` ON `cms_courses` (`canonical_id`,`locale`);--> statement-breakpoint
CREATE TABLE `cms_modules` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`canonical_id` text NOT NULL,
	`metadata_json` text NOT NULL,
	`source_document_json` text NOT NULL,
	`source_hash` text NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `cms_courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_module_identity` ON `cms_modules` (`course_id`,`canonical_id`);--> statement-breakpoint
CREATE TABLE `cms_page_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`revision` integer NOT NULL,
	`document_json` text NOT NULL,
	`wording_review_required` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `cms_pages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_page_revision` ON `cms_page_revisions` (`page_id`,`revision`);--> statement-breakpoint
CREATE TABLE `cms_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`module_id` text NOT NULL,
	`canonical_id` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`module_id`) REFERENCES `cms_modules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_page_identity` ON `cms_pages` (`module_id`,`canonical_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cms_page_position` ON `cms_pages` (`module_id`,`position`);