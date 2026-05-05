import type { SqliteDatabase } from '../types.js';
import { createManualTransactionProvider } from './manual-transaction.js';
import type { SqliteProvider } from './types.js';

/**
 * Structural database shape used to identify better-sqlite3 connections.
 */
export type BetterSqlite3Database = SqliteDatabase & {
  transaction?: unknown;
  open?: boolean;
};

/**
 * Checks whether a value looks like a better-sqlite3 database instance.
 */
export function isBetterSqlite3Database(db: unknown): db is BetterSqlite3Database {
  const candidate = db as Partial<BetterSqlite3Database>;
  return (
    typeof candidate.exec === 'function' &&
    typeof candidate.prepare === 'function' &&
    typeof candidate.transaction === 'function' &&
    typeof candidate.open === 'boolean'
  );
}

/**
 * Creates a sqlite-up provider for better-sqlite3 database instances.
 */
export function createBetterSqlite3Provider(db: BetterSqlite3Database): SqliteProvider {
  return createManualTransactionProvider(db);
}
