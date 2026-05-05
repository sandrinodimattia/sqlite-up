import { Database, type SQLQueryBindings } from 'bun:sqlite';
import { afterEach, describe, expect, it } from 'bun:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SQL } from 'bun';

import { MigrationError, MigrationExecutionError, MigrationFileError, MigrationLockError, Migrator } from './index';
import type { MigratorDatabase } from './types';

type BunMigratorTestProvider = {
  name: string;
  createDatabase: () => {
    db: MigratorDatabase;
    close: () => unknown;
    all: <T = unknown>(sql: string, params?: SQLQueryBindings[]) => Promise<T[]>;
    get: <T = unknown>(sql: string, params?: SQLQueryBindings[]) => Promise<T | undefined>;
    run: (sql: string, params?: SQLQueryBindings[]) => Promise<unknown>;
  };
};

const providers: BunMigratorTestProvider[] = [
  {
    name: 'Bun synchronous SQLite',
    createDatabase: () => {
      const db = new Database(':memory:');

      return {
        db,
        close: () => db.close(),
        all: async <T>(sql: string, params: SQLQueryBindings[] = []) => db.query(sql).all(...params) as T[],
        get: async <T>(sql: string, params: SQLQueryBindings[] = []) => db.query(sql).get(...params) as T | undefined,
        run: async (sql: string, params: SQLQueryBindings[] = []) => db.query(sql).run(...params),
      };
    },
  },
  {
    name: 'Bun SQL SQLite',
    createDatabase: () => {
      const sql = new SQL(':memory:');

      return {
        db: sql,
        close: () => sql.close(),
        all: async <T>(query: string, params: SQLQueryBindings[] = []) =>
          (await sql.unsafe<T[]>(query, params.length > 0 ? params : undefined)) as T[],
        get: async <T>(query: string, params: SQLQueryBindings[] = []) => {
          const rows = (await sql.unsafe<T[]>(query, params.length > 0 ? params : undefined)) as T[];
          return rows[0];
        },
        run: async (query: string, params: SQLQueryBindings[] = []) =>
          sql.unsafe(query, params.length > 0 ? params : undefined),
      };
    },
  },
];

async function createTempMigrationsDir(
  prefix = 'sqlite-up-bun-index-'
): Promise<{ tempDir: string; migrationsDir: string }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const migrationsDir = path.join(tempDir, 'migrations');
  await fs.mkdir(migrationsDir);
  return { tempDir, migrationsDir };
}

async function writeMigration(migrationsDir: string, name: string, body: string): Promise<void> {
  await fs.writeFile(path.join(migrationsDir, name), body);
}

async function writeUserAndPostMigrations(migrationsDir: string): Promise<void> {
  await writeMigration(
    migrationsDir,
    '001_users.ts',
    `
    export async function up(db) {
      await db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)');
    }
    export async function down(db) {
      await db.exec('DROP TABLE users');
    }
    `
  );

  await writeMigration(
    migrationsDir,
    '002_posts.ts',
    `
    export async function up(db) {
      await db.exec('CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER)');
    }
    export async function down(db) {
      await db.exec('DROP TABLE posts');
    }
    `
  );
}

describe('Migrator with Bun providers', () => {
  const cleanup: Array<() => unknown> = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const close of cleanup.splice(0)) {
      close();
    }

    for (const tempDir of tempDirs.splice(0)) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  for (const provider of providers) {
    describe(provider.name, () => {
      async function createContext(options: { seedDefaultMigrations?: boolean } = {}) {
        const { tempDir, migrationsDir } = await createTempMigrationsDir();
        tempDirs.push(tempDir);

        const database = provider.createDatabase();
        cleanup.push(database.close);

        if (options.seedDefaultMigrations) {
          await writeUserAndPostMigrations(migrationsDir);
        }

        return {
          ...database,
          migrationsDir,
          migrator: new Migrator({
            db: database.db,
            migrationsDir,
          }),
        };
      }

      it('creates required tables', async () => {
        const { get, migrator } = await createContext();

        await migrator.status();

        await expect(
          get("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
        ).resolves.toBeDefined();
        await expect(
          get("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations_lock'")
        ).resolves.toBeDefined();
      });

      it('allows custom table names', async () => {
        const { db, get, migrationsDir } = await createContext();
        const migrator = new Migrator({
          db,
          migrationsDir,
          migrationsTable: 'custom_migrations',
          migrationsLockTable: 'custom_lock',
        });

        await migrator.status();

        await expect(
          get("SELECT name FROM sqlite_master WHERE type='table' AND name='custom_migrations'")
        ).resolves.toBeDefined();
        await expect(
          get("SELECT name FROM sqlite_master WHERE type='table' AND name='custom_lock'")
        ).resolves.toBeDefined();
      });

      it('loads migrations in correct order', async () => {
        const { migrationsDir, migrator } = await createContext();
        await writeMigration(
          migrationsDir,
          '002_second.ts',
          `
          export async function up(db) { await db.exec('CREATE TABLE second (id INTEGER PRIMARY KEY)'); }
          export async function down(db) { await db.exec('DROP TABLE second'); }
          `
        );
        await writeMigration(
          migrationsDir,
          '001_first.ts',
          `
          export async function up(db) { await db.exec('CREATE TABLE first (id INTEGER PRIMARY KEY)'); }
          export async function down(db) { await db.exec('DROP TABLE first'); }
          `
        );

        const plan = await migrator.plan();

        expect(plan.pendingMigrations).toEqual(['001_first.ts', '002_second.ts']);
      });

      it('throws on invalid migration files', async () => {
        const { migrationsDir, migrator } = await createContext();
        await writeMigration(migrationsDir, 'invalid.ts', 'export const invalid = true;');

        await expect(migrator.plan()).rejects.toThrow(MigrationFileError);
      });

      it('throws on syntax errors in migration files', async () => {
        const { migrationsDir, migrator } = await createContext();
        await writeMigration(migrationsDir, 'syntax_error.ts', 'export const up = function( {');

        await expect(migrator.plan()).rejects.toThrow(MigrationFileError);
      });

      it('handles missing migration directories', async () => {
        const { db } = provider.createDatabase();
        cleanup.push(() => (db as { close?: () => unknown }).close?.());
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sqlite-up-bun-missing-'));
        tempDirs.push(tempDir);

        const migrator = new Migrator({
          db,
          migrationsDir: path.join(tempDir, 'missing'),
        });

        await expect(migrator.plan()).rejects.toThrow(MigrationFileError);
      });

      it('applies migrations successfully', async () => {
        const { all, migrator } = await createContext({ seedDefaultMigrations: true });

        const result = await migrator.apply();

        expect(result.success).toBe(true);
        expect(result.appliedMigrations).toEqual(['001_users.ts', '002_posts.ts']);
        await expect(
          all("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'posts')")
        ).resolves.toHaveLength(2);
      });

      it('returns migration errors and rolls back partial batches', async () => {
        const { all, migrationsDir, migrator } = await createContext();
        await writeMigration(
          migrationsDir,
          '001_success.ts',
          `
          export async function up(db) {
            await db.exec('CREATE TABLE success (id INTEGER PRIMARY KEY)');
          }
          export async function down(db) {
            await db.exec('DROP TABLE success');
          }
          `
        );
        await writeMigration(
          migrationsDir,
          '002_fail.ts',
          `
          export async function up(db) {
            await db.exec('INVALID SQL');
          }
          export async function down(db) {}
          `
        );

        const result = await migrator.apply();

        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(MigrationExecutionError);
        expect(result.appliedMigrations).toEqual([]);
        await expect(
          all("SELECT name FROM sqlite_master WHERE type='table' AND name = 'success'")
        ).resolves.toHaveLength(0);
      });

      it('does not emit applied events when the migration transaction fails', async () => {
        const { migrationsDir, migrator } = await createContext({ seedDefaultMigrations: true });
        await writeMigration(
          migrationsDir,
          '003_error.ts',
          `
          export async function up(db) {
            await db.exec('INVALID SQL');
          }
          export async function down(db) {}
          `
        );
        const events: string[] = [];
        migrator.on('migration:applied', (name) => events.push(String(name)));

        const result = await migrator.apply();

        expect(result.success).toBe(false);
        expect(events).toEqual([]);
      });

      it('rolls back migrations', async () => {
        const { all, migrator } = await createContext({ seedDefaultMigrations: true });

        await migrator.apply();
        const result = await migrator.rollback();

        expect(result.success).toBe(true);
        expect(result.appliedMigrations).toEqual(['002_posts.ts', '001_users.ts']);
        await expect(
          all("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'posts')")
        ).resolves.toHaveLength(0);
      });

      it('does not report or emit rolled back migrations when rollback transaction fails', async () => {
        const { all, migrationsDir, migrator } = await createContext();
        await writeMigration(
          migrationsDir,
          '001_users.ts',
          `
          export async function up(db) {
            await db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)');
          }
          export async function down(db) {
            throw new Error('Rollback failed');
          }
          `
        );
        await writeMigration(
          migrationsDir,
          '002_posts.ts',
          `
          export async function up(db) {
            await db.exec('CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER)');
          }
          export async function down(db) {
            await db.exec('DROP TABLE posts');
          }
          `
        );
        const events: string[] = [];
        migrator.on('migration:rollback', (name) => events.push(String(name)));

        await migrator.apply();
        const result = await migrator.rollback();

        expect(result.success).toBe(false);
        expect(result.appliedMigrations).toEqual([]);
        expect(events).toEqual([]);
        await expect(
          all("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'posts')")
        ).resolves.toHaveLength(2);
      });

      it('handles concurrent migration locks', async () => {
        const { migrator, run } = await createContext({ seedDefaultMigrations: true });

        await migrator.status();
        await run('UPDATE schema_migrations_lock SET locked = 1 WHERE id = 1');
        const result = await migrator.apply();

        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(MigrationLockError);
        expect(result.appliedMigrations).toEqual([]);
      });

      it('releases locks after errors', async () => {
        const { get, migrationsDir, migrator } = await createContext();
        await writeMigration(
          migrationsDir,
          '001_error.ts',
          `
          export async function up() { throw new Error('Simulated error'); }
          export async function down() {}
          `
        );

        await migrator.apply();

        const lockStatus = await get<{ locked: number }>('SELECT locked FROM schema_migrations_lock WHERE id = 1');
        expect(lockStatus?.locked).toBe(0);
      });

      it('records and removes migrations', async () => {
        const { all, migrator } = await createContext({ seedDefaultMigrations: true });

        await migrator.apply();
        const records = await all<{ batch: number }>('SELECT * FROM schema_migrations ORDER BY batch ASC');
        expect(records).toHaveLength(2);
        expect(records[0]?.batch).toBe(1);

        await migrator.rollback();
        await expect(all('SELECT * FROM schema_migrations')).resolves.toHaveLength(0);
      });

      it('reports status and creates plans', async () => {
        const { migrator } = await createContext({ seedDefaultMigrations: true });

        const initialStatus = await migrator.status();
        expect(initialStatus.currentBatch).toBe(0);
        expect(initialStatus.pending).toBe(2);
        expect(initialStatus.applied).toEqual([]);

        const plan = await migrator.plan();
        expect(plan.nextBatch).toBe(1);
        expect(plan.pendingMigrations).toEqual(['001_users.ts', '002_posts.ts']);

        await migrator.apply();

        const finalStatus = await migrator.status();
        expect(finalStatus.currentBatch).toBe(1);
        expect(finalStatus.pending).toBe(0);
        expect(finalStatus.applied).toHaveLength(2);

        const emptyPlan = await migrator.plan();
        expect(emptyPlan.nextBatch).toBe(2);
        expect(emptyPlan.pendingMigrations).toEqual([]);
      });

      it('emits events for apply and rollback operations', async () => {
        const { migrator } = await createContext({ seedDefaultMigrations: true });
        const events: string[] = [];
        migrator.on('migration:applied', (name) => events.push(`applied:${name}`));
        migrator.on('migration:rollback', (name) => events.push(`rolledback:${name}`));
        migrator.on('error', (error) => events.push(`error:${error.message}`));

        await migrator.apply();
        await migrator.rollback();

        expect(events).toContain('applied:001_users.ts');
        expect(events).toContain('applied:002_posts.ts');
        expect(events).toContain('rolledback:002_posts.ts');
        expect(events).toContain('rolledback:001_users.ts');
        expect(events.some((event) => event.startsWith('error:'))).toBe(false);
      });

      it('handles empty migrations directories', async () => {
        const { migrator } = await createContext();

        const status = await migrator.status();
        const plan = await migrator.plan();

        expect(status.pending).toBe(0);
        expect(plan.pendingMigrations).toEqual([]);
      });

      it('handles large batches of migrations', async () => {
        const { get, migrationsDir, migrator } = await createContext();
        for (let i = 1; i <= 10; i++) {
          const num = i.toString().padStart(3, '0');
          await writeMigration(
            migrationsDir,
            `${num}_table.ts`,
            `
            export async function up(db) {
              await db.exec('CREATE TABLE table_${num} (id INTEGER PRIMARY KEY)');
            }
            export async function down(db) {
              await db.exec('DROP TABLE table_${num}');
            }
            `
          );
        }

        const result = await migrator.apply();
        const tables = await get<{ count: number }>(
          "SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name LIKE 'table_%'"
        );

        expect(result.success).toBe(true);
        expect(result.appliedMigrations).toHaveLength(10);
        expect(tables?.count).toBe(10);
      });

      it('respects supported file extensions', async () => {
        const { db, migrationsDir, migrator } = await createContext();
        await writeMigration(
          migrationsDir,
          '001_users.ts',
          `
          export async function up(db) {
            await db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)');
          }
          export async function down(db) {
            await db.exec('DROP TABLE users');
          }
          `
        );
        await writeMigration(
          migrationsDir,
          '002_posts.js',
          `
          export async function up(db) {
            await db.exec('CREATE TABLE posts (id INTEGER PRIMARY KEY)');
          }
          export async function down(db) {
            await db.exec('DROP TABLE posts');
          }
          `
        );
        await writeMigration(
          migrationsDir,
          '003_comments.mjs',
          `
          export async function up(db) {
            await db.exec('CREATE TABLE comments (id INTEGER PRIMARY KEY)');
          }
          export async function down(db) {
            await db.exec('DROP TABLE comments');
          }
          `
        );
        await writeMigration(migrationsDir, '004_types.d.ts', 'export interface User { id: number; }');

        expect((await migrator.plan()).pendingMigrations).toEqual(['001_users.ts', '002_posts.js']);
        expect(
          (
            await new Migrator({
              db,
              migrationsDir,
              fileExtensions: ['mjs'],
            }).plan()
          ).pendingMigrations
        ).toEqual(['003_comments.mjs']);
        expect(
          (
            await new Migrator({
              db,
              migrationsDir,
              fileExtensions: ['ts'],
            }).plan()
          ).pendingMigrations
        ).toEqual(['001_users.ts']);
      });
    });
  }

  it('returns initialization errors from apply', async () => {
    const { tempDir, migrationsDir } = await createTempMigrationsDir();
    tempDirs.push(tempDir);
    await writeUserAndPostMigrations(migrationsDir);

    const migrator = new Migrator({
      db: {
        exec: () => {
          throw new Error('Database error');
        },
        prepare: () => {
          throw new Error('Database error');
        },
      } as unknown as MigratorDatabase,
      migrationsDir,
    });

    const result = await migrator.apply();

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(MigrationError);
    expect(result.appliedMigrations).toEqual([]);
  });
});
