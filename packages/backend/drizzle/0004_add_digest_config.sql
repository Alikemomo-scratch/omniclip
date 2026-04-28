-- Add digest_config JSONB column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS digest_config JSONB;
