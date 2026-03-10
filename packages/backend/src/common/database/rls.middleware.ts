import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * Set the current user ID in the PostgreSQL session for RLS policy evaluation.
 * Must be called within a transaction for proper isolation.
 *
 * @param db - Drizzle database instance
 * @param userId - The authenticated user's UUID
 */
export async function setRlsContext(
  db: NodePgDatabase,
  userId: string,
): Promise<void> {
  await db.execute(
    sql`SELECT set_config('app.current_user_id', ${userId}, true)`,
  );
}

/**
 * Execute a callback within a transaction that has RLS context set.
 *
 * @param db - Drizzle database instance
 * @param userId - The authenticated user's UUID
 * @param callback - Function to execute within the RLS-scoped transaction
 * @returns The result of the callback
 */
export async function withRlsContext<T>(
  db: NodePgDatabase,
  userId: string,
  callback: (tx: NodePgDatabase) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.current_user_id', ${userId}, true)`,
    );
    return callback(tx as unknown as NodePgDatabase);
  });
}
