-- ROLLBACK: Remove task_board_columns from organizations
-- Run this to undo the previous migration that added the column incorrectly.

ALTER TABLE "public"."organizations"
  DROP COLUMN IF EXISTS "task_board_columns";
