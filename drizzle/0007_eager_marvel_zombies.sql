CREATE TABLE `school_operations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`operation_key` text NOT NULL,
	`batch_id` text NOT NULL,
	`kind` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` integer NOT NULL,
	`before_json` text NOT NULL,
	`after_json` text NOT NULL,
	`actor_id` integer NOT NULL,
	`actor_name` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_school_operations_key` ON `school_operations` (`operation_key`);--> statement-breakpoint
CREATE INDEX `idx_school_operations_target` ON `school_operations` (`target_type`,`target_id`,`id`);
--> statement-breakpoint
CREATE TRIGGER trace_freeze_school_operations_insert
BEFORE INSERT ON school_operations
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN SELECT RAISE(ABORT, 'Legacy storage is frozen'); END;
--> statement-breakpoint
CREATE TRIGGER trace_school_operations_no_update BEFORE UPDATE ON school_operations
BEGIN SELECT RAISE(ABORT, 'Operation history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER trace_school_operations_no_delete BEFORE DELETE ON school_operations
BEGIN SELECT RAISE(ABORT, 'Operation history is immutable'); END;
--> statement-breakpoint
PRAGMA optimize;
