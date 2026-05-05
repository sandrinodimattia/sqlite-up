import { describe, expect, it } from 'vitest';

import type { SqliteDatabase, SqliteStatement } from '../types';
import { createManualTransactionProvider } from './manual-transaction';

describe('manual transaction provider', () => {
  it('starts write transactions with immediate locking', async () => {
    const execCalls: string[] = [];
    const db: SqliteDatabase = {
      exec: (sql: string) => {
        execCalls.push(sql);
      },
      prepare: () => {
        throw new Error('prepare should not be called');
      },
    };

    const provider = createManualTransactionProvider(db);

    await provider.transaction(() => {});

    expect(execCalls).toEqual(['BEGIN IMMEDIATE', 'COMMIT']);
  });

  it('rolls back async failures in one SQL transaction', async () => {
    const execCalls: string[] = [];
    const db: SqliteDatabase = {
      exec: (sql: string) => {
        execCalls.push(sql);
      },
      prepare: () => ({}) as SqliteStatement,
    };

    const provider = createManualTransactionProvider(db);

    await expect(
      provider.transaction(async () => {
        await Promise.resolve();
        throw new Error('after await');
      })
    ).rejects.toThrow('after await');

    expect(execCalls).toEqual(['BEGIN IMMEDIATE', 'ROLLBACK']);
  });
});
