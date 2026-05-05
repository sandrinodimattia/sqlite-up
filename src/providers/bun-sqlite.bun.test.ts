import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, it } from 'bun:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Migrator } from '../index';
import { createBunSqliteProvider, isBunSqliteDatabase } from './bun-sqlite';

async function createMigrationsDir(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sqlite-up-bun-sqlite-'));
  const migrationsDir = path.join(tempDir, 'migrations');
  await fs.mkdir(migrationsDir);

  await fs.writeFile(
    path.join(migrationsDir, '001_users.ts'),
    `
      export async function up(db) {
        await db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
        await db.prepare('INSERT INTO users (name) VALUES (?)').run('Ada');
      }

      export async function down(db) {
        await db.exec('DROP TABLE users');
      }
    `
  );

  return migrationsDir;
}

describe('bun:sqlite provider', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const tempDir of tempDirs.splice(0)) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('runs migrations with Bun Database', async () => {
    const migrationsDir = await createMigrationsDir();
    tempDirs.push(path.dirname(migrationsDir));

    const db = new Database(':memory:');
    const migrator = new Migrator({ db, migrationsDir });

    const result = await migrator.apply();

    expect(result.success).toBe(true);
    expect(result.appliedMigrations).toEqual(['001_users.ts']);
    expect(db.query('SELECT name FROM users').get()).toEqual({ name: 'Ada' });

    db.close();
  });

  it('uses transactional rollback with Bun Database', async () => {
    const db = new Database(':memory:');
    const provider = createBunSqliteProvider(db);

    expect(isBunSqliteDatabase(db)).toBe(true);

    await expect(
      provider.transaction(async () => {
        await provider.db.exec('CREATE TABLE rolled_back (id INTEGER PRIMARY KEY)');
        await provider.db.exec('INVALID SQL');
      })
    ).rejects.toThrow();

    expect(db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rolled_back'").get()).toBeNull();

    db.close();
  });

  it('does not use Bun native transactions for async migration callbacks', async () => {
    const db = new Database(':memory:');
    const nativeTransaction = db.transaction.bind(db);
    let nativeTransactionCalls = 0;
    db.transaction = ((...args: Parameters<typeof db.transaction>) => {
      nativeTransactionCalls += 1;
      return nativeTransaction(...args);
    }) as typeof db.transaction;
    const provider = createBunSqliteProvider(db);

    await expect(
      provider.transaction(async () => {
        await provider.db.exec('CREATE TABLE success (id INTEGER PRIMARY KEY)');
        await Promise.resolve();
        await provider.db.exec('INVALID SQL');
      })
    ).rejects.toThrow();

    expect(nativeTransactionCalls).toBe(0);
    expect(db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'success'").get()).toBeNull();

    db.close();
  });
});
