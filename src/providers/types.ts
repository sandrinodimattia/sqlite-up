import type { MaybePromise, SqliteDatabase } from '../types.js';

/**
 * Adapter that normalizes driver-specific SQLite behavior for the migrator.
 */
export interface SqliteProvider {
  /**
   * Database facade used by migration code.
   */
  db: SqliteDatabase;

  /**
   * Runs migration bookkeeping and user migration code atomically.
   */
  transaction(fn: () => MaybePromise<void>): Promise<void>;
}
