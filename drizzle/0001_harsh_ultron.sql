CREATE TABLE `academic_course_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`student_id` integer NOT NULL,
	`school_year` integer NOT NULL,
	`grade_level` integer NOT NULL,
	`semester` integer NOT NULL,
	`subject_group` text NOT NULL,
	`subject` text NOT NULL,
	`course_type` text DEFAULT '' NOT NULL,
	`selection_status` text DEFAULT 'completed' NOT NULL,
	`credits` integer DEFAULT 0 NOT NULL,
	`raw_score` text DEFAULT '' NOT NULL,
	`achievement` text DEFAULT '' NOT NULL,
	`rank_grade` text DEFAULT '' NOT NULL,
	`class_average` text DEFAULT '' NOT NULL,
	`standard_deviation` text DEFAULT '' NOT NULL,
	`student_count` integer,
	`evidence_text` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `profile_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_academic_course_student_term` ON `academic_course_records` (`student_id`,`grade_level`,`semester`);--> statement-breakpoint
CREATE INDEX `idx_academic_course_snapshot_group` ON `academic_course_records` (`snapshot_id`,`subject_group`);--> statement-breakpoint
CREATE TABLE `academic_trends` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`student_id` integer NOT NULL,
	`subject_group` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`direction` text DEFAULT 'insufficient' NOT NULL,
	`summary` text NOT NULL,
	`points_json` text DEFAULT '[]' NOT NULL,
	`evidence_refs_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `profile_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_academic_trends_student_group` ON `academic_trends` (`student_id`,`subject_group`);--> statement-breakpoint
CREATE INDEX `idx_academic_trends_snapshot` ON `academic_trends` (`snapshot_id`);--> statement-breakpoint
CREATE TABLE `competency_evaluations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`student_id` integer NOT NULL,
	`source_key` text NOT NULL,
	`competency` text NOT NULL,
	`score` integer DEFAULT 50 NOT NULL,
	`level` text NOT NULL,
	`summary` text NOT NULL,
	`evidence_refs_json` text DEFAULT '[]' NOT NULL,
	`strengths_json` text DEFAULT '[]' NOT NULL,
	`gaps_json` text DEFAULT '[]' NOT NULL,
	`next_actions_json` text DEFAULT '[]' NOT NULL,
	`caveat` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `profile_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_competency_evaluations_student_score` ON `competency_evaluations` (`student_id`,`score`);--> statement-breakpoint
CREATE INDEX `idx_competency_evaluations_snapshot_source` ON `competency_evaluations` (`snapshot_id`,`source_key`);--> statement-breakpoint
CREATE TABLE `credit_summaries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`student_id` integer NOT NULL,
	`subject_group` text NOT NULL,
	`completed_credits` integer DEFAULT 0 NOT NULL,
	`selected_credits` integer DEFAULT 0 NOT NULL,
	`planned_credits` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`evidence_refs_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `profile_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_credit_summaries_snapshot_group` ON `credit_summaries` (`snapshot_id`,`subject_group`);--> statement-breakpoint
CREATE INDEX `idx_credit_summaries_student` ON `credit_summaries` (`student_id`);--> statement-breakpoint
CREATE TABLE `evaluation_references` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`student_id` integer NOT NULL,
	`source_key` text NOT NULL,
	`title` text NOT NULL,
	`institution` text DEFAULT '' NOT NULL,
	`admissions_year` integer,
	`admission_track` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `profile_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_evaluation_references_snapshot_key` ON `evaluation_references` (`snapshot_id`,`source_key`);--> statement-breakpoint
CREATE INDEX `idx_evaluation_references_student` ON `evaluation_references` (`student_id`);--> statement-breakpoint
CREATE TABLE `ontology_edges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`student_id` integer NOT NULL,
	`source_key` text NOT NULL,
	`target_key` text NOT NULL,
	`relation` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`weight` integer DEFAULT 50 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `profile_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_ontology_edges_snapshot` ON `ontology_edges` (`snapshot_id`);--> statement-breakpoint
CREATE INDEX `idx_ontology_edges_student_relation` ON `ontology_edges` (`student_id`,`relation`);--> statement-breakpoint
CREATE TABLE `ontology_nodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`student_id` integer NOT NULL,
	`node_key` text NOT NULL,
	`node_type` text NOT NULL,
	`label` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`weight` integer DEFAULT 50 NOT NULL,
	`evidence_refs_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `profile_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ontology_nodes_snapshot_key` ON `ontology_nodes` (`snapshot_id`,`node_key`);--> statement-breakpoint
CREATE INDEX `idx_ontology_nodes_student_type` ON `ontology_nodes` (`student_id`,`node_type`);--> statement-breakpoint
CREATE TABLE `profile_sections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`student_id` integer NOT NULL,
	`section_type` text NOT NULL,
	`school_year` integer NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`evidence_text` text DEFAULT '' NOT NULL,
	`keywords_json` text DEFAULT '[]' NOT NULL,
	`competencies_json` text DEFAULT '[]' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `profile_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_profile_sections_snapshot_order` ON `profile_sections` (`snapshot_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_profile_sections_student_type` ON `profile_sections` (`student_id`,`section_type`);--> statement-breakpoint
CREATE TABLE `profile_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` integer NOT NULL,
	`created_by` integer NOT NULL,
	`version_label` text NOT NULL,
	`schema_version` text DEFAULT '1.0' NOT NULL,
	`one_line_profile` text NOT NULL,
	`narrative` text NOT NULL,
	`strengths_json` text DEFAULT '[]' NOT NULL,
	`cautions_json` text DEFAULT '[]' NOT NULL,
	`course_pattern` text DEFAULT '' NOT NULL,
	`source_years_json` text DEFAULT '[]' NOT NULL,
	`raw_json` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_profile_snapshots_student_active` ON `profile_snapshots` (`student_id`,`is_active`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_profile_snapshots_student_version` ON `profile_snapshots` (`student_id`,`version_label`);--> statement-breakpoint
CREATE TABLE `research_keywords` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`student_id` integer NOT NULL,
	`keyword` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`weight` integer DEFAULT 50 NOT NULL,
	`evidence_refs_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `profile_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_research_keywords_student_weight` ON `research_keywords` (`student_id`,`weight`);--> statement-breakpoint
CREATE INDEX `idx_research_keywords_snapshot` ON `research_keywords` (`snapshot_id`);--> statement-breakpoint
CREATE TABLE `student_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` integer NOT NULL,
	`owner_user_id` integer NOT NULL,
	`school_year` integer NOT NULL,
	`record_grade` integer NOT NULL,
	`object_key` text NOT NULL,
	`original_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`processing_status` text DEFAULT 'source_only' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_student_records_object_key` ON `student_records` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_student_records_student_grade` ON `student_records` (`student_id`,`record_grade`);--> statement-breakpoint
CREATE TABLE `wiki_pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`student_id` integer NOT NULL,
	`slug` text NOT NULL,
	`page_type` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`body_markdown` text NOT NULL,
	`keywords_json` text DEFAULT '[]' NOT NULL,
	`linked_node_keys_json` text DEFAULT '[]' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `profile_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_wiki_pages_snapshot_slug` ON `wiki_pages` (`snapshot_id`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_wiki_pages_student_order` ON `wiki_pages` (`student_id`,`sort_order`);--> statement-breakpoint
ALTER TABLE `students` ADD `graduated_year` integer;--> statement-breakpoint
ALTER TABLE `students` ADD `graduated_at` text;--> statement-breakpoint
PRAGMA optimize;
