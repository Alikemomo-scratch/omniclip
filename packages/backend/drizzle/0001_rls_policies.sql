-- Enable RLS on all user-scoped tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owner / superuser connections.
-- Without this, the postgres superuser bypasses all RLS policies silently.
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE content_items FORCE ROW LEVEL SECURITY;
ALTER TABLE digests FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_jobs FORCE ROW LEVEL SECURITY;

-- Users table policies:
-- SELECT: Allow unrestricted reads when no RLS context is set (auth flows like
-- register/login/refresh need to query by email before a user ID is known).
-- When RLS context IS set, restrict to own row only.
CREATE POLICY users_select ON users
  FOR SELECT
  USING (
    CASE
      WHEN coalesce(current_setting('app.current_user_id', true), '') = '' THEN true
      ELSE id = current_setting('app.current_user_id', true)::uuid
    END
  );

-- INSERT: Allow freely (registration creates a new user row).
CREATE POLICY users_insert ON users
  FOR INSERT
  WITH CHECK (true);

-- UPDATE: Only own row.
CREATE POLICY users_update ON users
  FOR UPDATE
  USING (id = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK (id = current_setting('app.current_user_id', true)::uuid);

-- DELETE: Only own row.
CREATE POLICY users_delete ON users
  FOR DELETE
  USING (id = current_setting('app.current_user_id', true)::uuid);

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
