CREATE TABLE `storage_connection` (
	`id` integer PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'legacy' NOT NULL,
	`endpoint` text DEFAULT '' NOT NULL,
	`secret` text NOT NULL,
	`owner_auth_user_id` text NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
