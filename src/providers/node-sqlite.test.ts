import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import { createNodeSqliteProvider, isNodeSqliteDatabase } from './node-sqlite';

describe('node-sqlite provider', () => {
  it('detects Node DatabaseSync and rolls back failed transactions', async () => {
    const db = new DatabaseSync(':memory:');
    const provider = createNodeSqliteProvider(db);

    expect(isNodeSqliteDatabase(db)).toBe(true);

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
