CREATE TABLE `cms_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`default_locale` text DEFAULT 'en-global' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_provider_slug` ON `cms_providers` (`slug`);--> statement-breakpoint
DROP INDEX `cms_course_locale`;--> statement-breakpoint
ALTER TABLE `cms_courses` ADD `provider_id` text REFERENCES cms_providers(id);--> statement-breakpoint
ALTER TABLE `cms_courses` ADD `source_course_id` text REFERENCES cms_courses(id);--> statement-breakpoint
CREATE UNIQUE INDEX `cms_course_provider_locale` ON `cms_courses` (`provider_id`,`canonical_id`,`locale`);--> statement-breakpoint
ALTER TABLE `cms_modules` ADD `source_module_id` text REFERENCES cms_modules(id);--> statement-breakpoint
ALTER TABLE `cms_modules` ADD `headings_json` text;--> statement-breakpoint
ALTER TABLE `cms_modules` ADD `metadata_revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `cms_module_edition` ON `cms_modules` (`source_module_id`,`course_id`);--> statement-breakpoint
ALTER TABLE `cms_page_revisions` ADD `source_revision` integer;--> statement-breakpoint
ALTER TABLE `cms_page_revisions` ADD `translation_status` text;--> statement-breakpoint
ALTER TABLE `cms_page_revisions` ADD `review_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `cms_pages` ADD `source_page_id` text REFERENCES cms_pages(id);
--> statement-breakpoint
INSERT INTO cms_providers (id,name,slug,default_locale,created_at) VALUES ('019a0640-0000-7000-8000-000000000001','New Vines International','new-vines','en-global','2026-10-21T00:00:00.000Z');
--> statement-breakpoint
UPDATE cms_courses SET provider_id='019a0640-0000-7000-8000-000000000001' WHERE provider_id IS NULL;
