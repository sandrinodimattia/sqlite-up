import { afterEach, describe, expect, it } from 'bun:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SQL } from 'bun';
import { Migrator } from '../index';
import { createBunSqlProvider, isBunSqlDatabase } from './bun-sql';

async function createMigrationsDir(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sqlite-up-bun-sql-'));
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

describe('Bun SQL provider', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const tempDir of tempDirs.splice(0)) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('runs migrations with Bun SQL SQLite', async () => {
    const migrationsDir = await createMigrationsDir();
    tempDirs.push(path.dirname(migrationsDir));

    const sql = new SQL(':memory:');
    const migrator = new Migrator({ db: sql, migrationsDir });

    const result = await migrator.apply();

    expect(result.success).toBe(true);
    expect(result.appliedMigrations).toEqual(['001_users.ts']);
    expect(await sql.unsafe<Array<{ name: string }>>('SELECT name FROM users')).toEqual([{ name: 'Ada' }]);

    sql.close();
  });

  it('uses Bun SQL begin for transactions', async () => {
    const sql = new SQL(':memory:');
    const provider = createBunSqlProvider(sql);

    expect(isBunSqlDatabase(sql)).toBe(true);

    await provider.db.exec('CREATE TABLE users (name TEXT NOT NULL)');
    await provider.transaction(async () => {
      await provider.db.prepare('INSERT INTO users (name) VALUES (?)').run('Ada');
    });

    expect(await sql.unsafe<Array<{ name: string }>>('SELECT name FROM users')).toEqual([{ name: 'Ada' }]);

    sql.close();
  });
});
