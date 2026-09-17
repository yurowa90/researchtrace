CREATE TABLE `identity_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`identity_id` integer NOT NULL,
	`revision` integer NOT NULL,
	`action` text NOT NULL,
	`target_user_id` integer,
	`actor_id` integer NOT NULL,
	`note` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`identity_id`) REFERENCES `school_identities`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_identity_events_revision` ON `identity_events` (`identity_id`,`revision`);--> statement-breakpoint
CREATE TABLE `school_identities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_id` text NOT NULL,
	`subject` text NOT NULL,
	`portal_mode` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`user_id` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`source` text DEFAULT 'request' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`reviewed_by` integer,
	`reviewed_at` text,
	`verification_note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_school_identities_site_subject` ON `school_identities` (`site_id`,`subject`);--> statement-breakpoint
CREATE INDEX `idx_school_identities_user` ON `school_identities` (`user_id`);
--> statement-breakpoint
CREATE TRIGGER trace_freeze_school_identities_insert
BEFORE INSERT ON "school_identities"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;

--> statement-breakpoint
CREATE TRIGGER trace_freeze_school_identities_update
BEFORE UPDATE ON "school_identities"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;

--> statement-breakpoint
CREATE TRIGGER trace_freeze_school_identities_delete
BEFORE DELETE ON "school_identities"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;

--> statement-breakpoint
CREATE TRIGGER trace_freeze_identity_events_insert
BEFORE INSERT ON "identity_events"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;

--> statement-breakpoint
CREATE TRIGGER trace_freeze_identity_events_update
BEFORE UPDATE ON "identity_events"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;

--> statement-breakpoint
CREATE TRIGGER trace_freeze_identity_events_delete
BEFORE DELETE ON "identity_events"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
