CREATE TABLE `guidance_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_key` text NOT NULL,
	`revision` integer NOT NULL,
	`kind` text NOT NULL,
	`student_id` integer,
	`audience` text DEFAULT 'student' NOT NULL,
	`include_in_work` integer DEFAULT false NOT NULL,
	`payload_json` text NOT NULL,
	`created_by` integer NOT NULL,
	`actor_name` text NOT NULL,
	`actor_role` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_guidance_entity_revision` ON `guidance_entries` (`entity_key`,`revision`);--> statement-breakpoint
CREATE INDEX `idx_guidance_student_kind` ON `guidance_entries` (`student_id`,`kind`);