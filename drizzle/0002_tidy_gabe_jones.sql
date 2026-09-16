CREATE TABLE `reference_materials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uploaded_by` integer NOT NULL,
	`title` text NOT NULL,
	`institution` text DEFAULT '' NOT NULL,
	`admissions_year` integer,
	`admission_track` text DEFAULT '' NOT NULL,
	`category` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`object_key` text NOT NULL,
	`original_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reference_materials_key` ON `reference_materials` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_reference_materials_status_year` ON `reference_materials` (`status`,`admissions_year`);--> statement-breakpoint
CREATE TABLE `reference_selections` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`material_ids_json` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `student_records` ADD `coverage_json` text DEFAULT '[]' NOT NULL;