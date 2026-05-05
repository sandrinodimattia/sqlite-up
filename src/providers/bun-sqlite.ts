import type { SqliteDatabase, SqliteStatement } from '../types.js';
import { createManualTransactionProvider } from './manual-transaction.js';
import type { SqliteProvider } from './types.js';

/**
 * Structural database shape used to identify Bun's synchronous SQLite client.
 */
export type BunSqliteSyncDatabase = SqliteDatabase & {
  query?: (sql: string) => SqliteStatement;
};

/**
 * Checks whether a value looks like a Bun SQLite database instance.
 */
export function isBunSqliteDatabase(db: unknown): db is BunSqliteSyncDatabase {
  const candidate = db as Partial<BunSqliteSyncDatabase>;
  return (
    typeof candidate.exec === 'function' &&
    typeof candidate.prepare === 'function' &&
    typeof candidate.query === 'function'
  );
}

/**
 * Creates a sqlite-up provider for Bun SQLite database instances.
 */
export function createBunSqliteProvider(db: BunSqliteSyncDatabase): SqliteProvider {
  return createManualTransactionProvider(db);
}
