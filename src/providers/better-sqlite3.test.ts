import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';

import { createBetterSqlite3Provider, isBetterSqlite3Database } from './better-sqlite3';

describe('better-sqlite3 provider', () => {
  it('supports better-sqlite3 as an optional runtime database', async () => {
    const db = new Database(':memory:');
    const provider = createBetterSqlite3Provider(db);

    expect(isBetterSqlite3Database(db)).toBe(true);

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

  it('does not use better-sqlite3 native transactions for async migration callbacks', async () => {
    const db = new Database(':memory:');
    const transactionSpy = vi.spyOn(db, 'transaction');
    const provider = createBetterSqlite3Provider(db);

    await expect(
      provider.transaction(async () => {
        await provider.db.exec('CREATE TABLE success (id INTEGER PRIMARY KEY)');
        await Promise.resolve();
        await provider.db.exec('INVALID SQL');
      })
    ).rejects.toThrow();

    expect(transactionSpy).not.toHaveBeenCalled();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='success'").get()).toBeUndefined();

    db.close();
  });
});
