-- Enable RLS on all user-scoped tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;

-- Users: user can only see their own row
CREATE POLICY users_isolation ON users
  USING (id = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK (id = current_setting('app.current_user_id', true)::uuid);

-- Platform connections: user can only see their own connections
CREATE POLICY platform_connections_isolation ON platform_connections
  USING (user_id = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

-- Content items: user can only see their own content
CREATE POLICY content_items_isolation ON content_items
  USING (user_id = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

-- Digests: user can only see their own digests
CREATE POLICY digests_isolation ON digests
  USING (user_id = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

-- Sync jobs: user can only see their own sync jobs
CREATE POLICY sync_jobs_isolation ON sync_jobs
  USING (user_id = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

-- Note: digest_items does not have a user_id column.
-- Access is controlled indirectly via the digest and content_item foreign keys.
-- RLS on digests and content_items ensures users cannot reference other users' data.
