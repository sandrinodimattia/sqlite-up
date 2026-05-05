import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import { createBunSqliteProvider, isBunSqliteDatabase } from './bun-sqlite';

function createBunSqliteLikeDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  const db = {
    exec: (sql: string) => sqlite.exec(sql),
    prepare: (sql: string) => sqlite.prepare(sql),
    query: (sql: string) => sqlite.prepare(sql),
    close: () => sqlite.close(),
  };

  return db;
}

describe('bun-sqlite provider', () => {
  it('detects Bun synchronous SQLite shape and rolls back failed transactions', async () => {
    const db = createBunSqliteLikeDatabase();
    const provider = createBunSqliteProvider(db);

    expect(isBunSqliteDatabase(db)).toBe(true);

    await expect(
      provider.transaction(async () => {
        await provider.db.exec('CREATE TABLE success (id INTEGER PRIMARY KEY)');
        await provider.db.exec('INVALID SQL');
      })
    ).rejects.toThrow();

    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='success'").get();
    expect(table).toBeUndefined();

    db.close();
  });
});
