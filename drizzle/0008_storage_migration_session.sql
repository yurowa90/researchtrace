ALTER TABLE `storage_connection` ADD `migration_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `storage_connection` ADD `migration_phase` text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE `storage_connection` ADD `migration_token` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `storage_connection` ADD `migration_lease_until` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- An interrupted older migration may already have reached the remote commit.
-- Keep its source frozen; allow only completion verification after upgrading.
UPDATE `storage_connection` SET `migration_id` = lower(hex(randomblob(16))), `migration_phase` = 'committing' WHERE `state` = 'migrating';--> statement-breakpoint
-- Preserve existing rows for an administrator to repair. Block new duplicate links.
CREATE TRIGGER trace_single_student_user_insert BEFORE INSERT ON students
WHEN NEW.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM students WHERE user_id = NEW.user_id)
BEGIN SELECT RAISE(ABORT, 'trace_student_account_in_use'); END;--> statement-breakpoint
CREATE TRIGGER trace_single_student_user_update BEFORE UPDATE OF user_id ON students
WHEN NEW.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM students WHERE user_id = NEW.user_id AND id <> NEW.id)
BEGIN SELECT RAISE(ABORT, 'trace_student_account_in_use'); END;
