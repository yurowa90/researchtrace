CREATE TABLE `activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` integer NOT NULL,
	`subject_id` integer NOT NULL,
	`created_by` integer NOT NULL,
	`title` text NOT NULL,
	`activity_type` text NOT NULL,
	`activity_date` text NOT NULL,
	`raw_text` text NOT NULL,
	`source_note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_activities_student_date` ON `activities` (`student_id`,`activity_date`);--> statement-breakpoint
CREATE INDEX `idx_activities_subject_status` ON `activities` (`subject_id`,`status`);--> statement-breakpoint
CREATE TABLE `activity_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`activity_id` integer NOT NULL,
	`owner_user_id` integer NOT NULL,
	`object_key` text NOT NULL,
	`original_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_activity_files_object_key` ON `activity_files` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_activity_files_activity_id` ON `activity_files` (`activity_id`);--> statement-breakpoint
CREATE TABLE `classes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`teacher_id` integer NOT NULL,
	`name` text NOT NULL,
	`grade` integer DEFAULT 1 NOT NULL,
	`school_year` integer DEFAULT 2026 NOT NULL,
	`invite_code` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_classes_invite_code` ON `classes` (`invite_code`);--> statement-breakpoint
CREATE INDEX `idx_classes_teacher_id` ON `classes` (`teacher_id`);--> statement-breakpoint
CREATE TABLE `fingerprints` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`activity_id` integer NOT NULL,
	`student_id` integer NOT NULL,
	`summary` text NOT NULL,
	`keywords_json` text DEFAULT '[]' NOT NULL,
	`methods_json` text DEFAULT '[]' NOT NULL,
	`evidence_json` text DEFAULT '[]' NOT NULL,
	`competencies_json` text DEFAULT '[]' NOT NULL,
	`questions_json` text DEFAULT '[]' NOT NULL,
	`subject_links_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`approved_by` integer,
	`approved_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_fingerprints_activity` ON `fingerprints` (`activity_id`);--> statement-breakpoint
CREATE INDEX `idx_fingerprints_student_status` ON `fingerprints` (`student_id`,`status`);--> statement-breakpoint
CREATE TABLE `inquiry_threads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` integer NOT NULL,
	`title` text NOT NULL,
	`focus_question` text NOT NULL,
	`status` text DEFAULT 'developing' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_inquiry_threads_student` ON `inquiry_threads` (`student_id`);--> statement-breakpoint
CREATE TABLE `students` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`class_id` integer NOT NULL,
	`user_id` integer,
	`student_number` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`status` text DEFAULT 'active' NOT NULL,
	`is_example` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_students_class_number` ON `students` (`class_id`,`student_number`);--> statement-breakpoint
CREATE INDEX `idx_students_user_id` ON `students` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_students_class_status` ON `students` (`class_id`,`status`);--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`class_id` integer NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#2457d6' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_subjects_class_name` ON `subjects` (`class_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_subjects_class_order` ON `subjects` (`class_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `thread_activities` (
	`thread_id` integer NOT NULL,
	`activity_id` integer NOT NULL,
	`sequence` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `inquiry_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_thread_activities_pair` ON `thread_activities` (`thread_id`,`activity_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`auth_user_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'student' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_auth_user_id` ON `users` (`auth_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_users_status_role` ON `users` (`status`,`role`);--> statement-breakpoint
PRAGMA optimize;
