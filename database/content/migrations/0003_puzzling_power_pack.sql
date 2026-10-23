CREATE TABLE `cms_module_structures` (
	`id` text PRIMARY KEY NOT NULL,
	`module_id` text NOT NULL,
	`revision` integer NOT NULL,
	`page_ids_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`module_id`) REFERENCES `cms_modules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_structure_revision` ON `cms_module_structures` (`module_id`,`revision`);