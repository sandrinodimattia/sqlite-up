import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import { createBunSqlProvider, isBunSqlDatabase } from './bun-sql';

type SqliteParameter = null | number | bigint | string | NodeJS.ArrayBufferView;

interface BunSqlLikeDatabase {
  unsafe(sql: string, params?: unknown[]): Promise<unknown[]>;
  begin<Result>(fn: (tx: BunSqlLikeDatabase) => Promise<Result> | Result): Promise<Result>;
  close(): void;
  readonly beginCalls: number;
}

function createBunSqlLikeDatabase(): BunSqlLikeDatabase {
  const sqlite = new DatabaseSync(':memory:');
  let beginCalls = 0;

  const createClient = (): BunSqlLikeDatabase => ({
    unsafe: async (sql: string, params: unknown[] = []) => {
      const statement = sqlite.prepare(sql);
      const bindParams = params as SqliteParameter[];
      const normalized = sql.trim().toLowerCase();
      if (normalized.startsWith('select') || normalized.startsWith('pragma') || normalized.startsWith('with')) {
        return statement.all(...bindParams);
      }

      statement.run(...bindParams);
      return [];
    },
    begin: async <Result>(fn: (tx: BunSqlLikeDatabase) => Promise<Result> | Result) => {
      beginCalls += 1;
      sqlite.exec('BEGIN');
      try {
        const result = await fn(createClient());
        sqlite.exec('COMMIT');
        return result;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
    close: () => sqlite.close(),
    get beginCalls() {
      return beginCalls;
    },
  });

  return createClient();
}

describe('bun-sql provider', () => {
  it('adapts Bun SQL unsafe/begin to the migration database surface', async () => {
    const sql = createBunSqlLikeDatabase();
    const provider = createBunSqlProvider(sql);

    expect(isBunSqlDatabase(sql)).toBe(true);

    await provider.db.exec('CREATE TABLE users (name TEXT NOT NULL)');
    await provider.transaction(async () => {
      await provider.db.prepare('INSERT INTO users (name) VALUES (?)').run('Ada');
    });

    const rows = await provider.db.prepare('SELECT name FROM users').all();
    expect(rows).toEqual([{ name: 'Ada' }]);
    expect(sql.beginCalls).toBe(1);

    sql.close();
  });
});
