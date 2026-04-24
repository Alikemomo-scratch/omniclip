-- Add archived_at column to content_items and digests
ALTER TABLE content_items ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE digests ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE;
