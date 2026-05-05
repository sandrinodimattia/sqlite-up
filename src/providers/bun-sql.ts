import type { BunSqliteDatabase, MaybePromise, SqliteDatabase, SqliteTransaction } from '../types.js';
import type { SqliteProvider } from './types.js';

/**
 * SQLite database facade whose transactions may complete asynchronously.
 */
interface AsyncTransactionalSqliteDatabase extends SqliteDatabase {
  /**
   * Creates a transaction runner that can await asynchronous transaction work.
   */
  transaction<Args extends unknown[], Result>(
    fn: (...args: Args) => MaybePromise<Result>
  ): SqliteTransaction<Args, Result>;
}

/**
 * Executes SQL through Bun SQL and normalizes empty parameter lists.
 */
async function executeBunSql(client: BunSqliteDatabase, sql: string, params: unknown[] = []): Promise<unknown[]> {
  return await client.unsafe(sql, params.length > 0 ? params : undefined);
}

/**
 * Checks whether a value looks like Bun's Promise-based SQL client for SQLite.
 */
export function isBunSqlDatabase(db: unknown): db is BunSqliteDatabase {
  const candidate = db as Partial<BunSqliteDatabase>;
  return typeof candidate.unsafe === 'function' && typeof (candidate as Partial<SqliteDatabase>).exec !== 'function';
}

/**
 * Creates a sqlite-up provider for Bun SQL SQLite clients.
 */
export function createBunSqlProvider(rootClient: BunSqliteDatabase): SqliteProvider {
  let activeClient = rootClient;

  const db: AsyncTransactionalSqliteDatabase = {
    /**
     * Executes a SQL statement through the currently active Bun SQL client.
     */
    exec: async (sql: string) => {
      await executeBunSql(activeClient, sql);
    },

    /**
     * Creates a prepared-statement facade backed by Bun SQL unsafe execution.
     */
    prepare: (sql: string) => ({
      /**
       * Runs the statement and returns all rows.
       */
      all: (...params: unknown[]) => executeBunSql(activeClient, sql, params),

      /**
       * Runs the statement and returns the first row.
       */
      get: async (...params: unknown[]) => {
        const rows = await executeBunSql(activeClient, sql, params);
        return rows[0];
      },

      /**
       * Runs the statement for side effects and returns the driver result.
       */
      run: (...params: unknown[]) => executeBunSql(activeClient, sql, params),
    }),

    /**
     * Creates a transaction runner using Bun SQL native transactions when available.
     */
    transaction: <Args extends unknown[], Result>(fn: (...args: Args) => MaybePromise<Result>) => {
      /**
       * Executes the transaction callback with the active transaction client.
       */
      const run = async (...args: Args): Promise<Result> => {
        if (typeof rootClient.begin === 'function') {
          return await rootClient.begin(async (tx) => {
            const previousClient = activeClient;
            activeClient = tx;

            try {
              return await fn(...args);
            } finally {
              activeClient = previousClient;
            }
          });
        }

        await db.exec('BEGIN');
        try {
          const result = await fn(...args);
          await db.exec('COMMIT');
          return result;
        } catch (err) {
          try {
            await db.exec('ROLLBACK');
          } catch {
            // Preserve the original transaction failure.
          }
          throw err;
        }
      };

      return run;
    },
  };

  return {
    db,

    /**
     * Runs migration work inside the Bun SQL transaction facade.
     */
    transaction: async (fn: () => MaybePromise<void>) => {
      const transaction = db.transaction(fn);
      await transaction();
    },
  };
}
