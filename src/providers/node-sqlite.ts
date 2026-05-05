import type { SqliteDatabase } from '../types.js';
import { createManualTransactionProvider } from './manual-transaction.js';
import type { SqliteProvider } from './types.js';

/**
 * Structural database shape used to identify Node's node:sqlite DatabaseSync.
 */
export type NodeSqliteDatabase = SqliteDatabase & {
  isOpen?: boolean;
};

/**
 * Checks whether a value looks like a node:sqlite database instance.
 */
export function isNodeSqliteDatabase(db: unknown): db is NodeSqliteDatabase {
  const candidate = db as Partial<NodeSqliteDatabase>;
  return (
    typeof candidate.exec === 'function' &&
    typeof candidate.prepare === 'function' &&
    typeof candidate.isOpen === 'boolean'
  );
}

/**
 * Creates a sqlite-up provider for node:sqlite database instances.
 */
export function createNodeSqliteProvider(db: NodeSqliteDatabase): SqliteProvider {
  return createManualTransactionProvider(db);
}
