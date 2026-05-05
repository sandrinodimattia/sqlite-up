import type { MigratorDatabase, SqliteDatabase } from '../types.js';
import { createBetterSqlite3Provider, isBetterSqlite3Database } from './better-sqlite3.js';
import { createBunSqlProvider, isBunSqlDatabase } from './bun-sql.js';
import { createBunSqliteProvider, isBunSqliteDatabase } from './bun-sqlite.js';
import { createManualTransactionProvider } from './manual-transaction.js';
import { createNodeSqliteProvider, isNodeSqliteDatabase } from './node-sqlite.js';
import type { SqliteProvider } from './types.js';

/**
 * Checks for the minimal SQLite database surface sqlite-up can use directly.
 */
function isSqliteDatabase(db: unknown): db is SqliteDatabase {
  const candidate = db as Partial<SqliteDatabase>;
  return typeof candidate.exec === 'function' && typeof candidate.prepare === 'function';
}

/**
 * Creates the best provider adapter for a supported SQLite database client.
 */
export function createSqliteProvider(db: MigratorDatabase): SqliteProvider {
  if (isBunSqlDatabase(db)) {
    return createBunSqlProvider(db);
  }

  if (isBunSqliteDatabase(db)) {
    return createBunSqliteProvider(db);
  }

  if (isBetterSqlite3Database(db)) {
    return createBetterSqlite3Provider(db);
  }

  if (isNodeSqliteDatabase(db)) {
    return createNodeSqliteProvider(db);
  }

  if (isSqliteDatabase(db)) {
    return createManualTransactionProvider(db);
  }

  if (typeof db === 'object' && db !== null) {
    return createManualTransactionProvider(db as SqliteDatabase);
  }

  throw new TypeError('Unsupported SQLite database provider.');
}

export { createBetterSqlite3Provider, isBetterSqlite3Database } from './better-sqlite3.js';
export { createBunSqlProvider, isBunSqlDatabase } from './bun-sql.js';
export { createBunSqliteProvider, isBunSqliteDatabase } from './bun-sqlite.js';
export { createNodeSqliteProvider, isNodeSqliteDatabase } from './node-sqlite.js';
export type { SqliteProvider } from './types.js';
