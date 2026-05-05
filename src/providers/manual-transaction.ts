import type { MaybePromise, SqliteDatabase } from '../types.js';
import type { SqliteProvider } from './types.js';

/**
 * Creates a provider that wraps migration work in explicit SQL transactions.
 */
export function createManualTransactionProvider(db: SqliteDatabase): SqliteProvider {
  return {
    db,

    /**
     * Runs the callback between BEGIN IMMEDIATE and COMMIT, rolling back on failure.
     */
    transaction: async (fn: () => MaybePromise<void>): Promise<void> => {
      await db.exec('BEGIN IMMEDIATE');
      try {
        await fn();
        await db.exec('COMMIT');
      } catch (err) {
        try {
          await db.exec('ROLLBACK');
        } catch {
          // Preserve the original transaction failure.
        }
        throw err;
      }
    },
  };
}
