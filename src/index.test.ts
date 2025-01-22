import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import SQLiteDatabase, { Database } from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  MigrationFileError,
  MigrationLockError,
  MigrationExecutionError,
  MigrationError,
} from './errors';
import { Migrator } from './index';

describe('Migrator', () => {
  let db: Database;
  let migrationsDir: string;
  let migrator: Migrator;
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for migrations
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sqlite-up-test-'));
    migrationsDir = path.join(tempDir, 'migrations');
    await fs.mkdir(migrationsDir);

    // Create in-memory database
    db = new SQLiteDatabase(':memory:');

    migrator = new Migrator({
      db,
      migrationsDir,
    });
  });

  afterEach(async () => {
    // Close database
    if (db.open) {
      db.close();
    }

    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    it('should create required tables', async () => {
      // Initialize tables
      await migrator.status();

      // Check migrations table
      const migrationsTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
        .get();
      expect(migrationsTable).toBeDefined();

      // Check lock table
      const lockTable = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations_lock'"
        )
        .get();
      expect(lockTable).toBeDefined();
    });

    it('should allow custom table names', async () => {
      const customMigrator = new Migrator({
        db,
        migrationsDir,
        migrationsTable: 'custom_migrations',
        migrationsLockTable: 'custom_lock',
      });

      await customMigrator.status();

      const migrationsTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='custom_migrations'")
        .get();
      expect(migrationsTable).toBeDefined();

      const lockTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='custom_lock'")
        .get();
      expect(lockTable).toBeDefined();
    });
  });

  describe('migration loading', () => {
    it('should load migrations in correct order', async () => {
      // Create test migrations
      await fs.writeFile(
        path.join(migrationsDir, '001_first.ts'),
        `
        export function up(db) { db.exec('CREATE TABLE first (id INTEGER PRIMARY KEY)'); }
        export function down(db) { db.exec('DROP TABLE first'); }
        `
      );

      await fs.writeFile(
        path.join(migrationsDir, '002_second.ts'),
        `
        export function up(db) { db.exec('CREATE TABLE second (id INTEGER PRIMARY KEY)'); }
        export function down(db) { db.exec('DROP TABLE second'); }
        `
      );

      const plan = await migrator.plan();
      expect(plan.pendingMigrations).toEqual(['001_first.ts', '002_second.ts']);
    });

    it('should throw on invalid migration file', async () => {
      await fs.writeFile(path.join(migrationsDir, 'invalid.ts'), 'export const invalid = true;');

      await expect(() => migrator.plan()).rejects.toThrow(MigrationError);
    });

    it('should throw on syntax error in migration file', async () => {
      await fs.writeFile(
        path.join(migrationsDir, 'syntax_error.ts'),
        'export const up = function( {' // Invalid syntax
      );

      await expect(() => migrator.plan()).rejects.toThrow(MigrationFileError);
    });

    it('should handle missing migration directory', async () => {
      const nonExistentDir = path.join(tempDir, 'non-existent');
      const invalidMigrator = new Migrator({
        db,
        migrationsDir: nonExistentDir,
      });

      await expect(() => invalidMigrator.plan()).rejects.toThrow(MigrationFileError);
    });
  });

  describe('migration operations', () => {
    beforeEach(async () => {
      // Create test migrations
      await fs.writeFile(
        path.join(migrationsDir, '001_users.ts'),
        `
        export function up(db) {
          db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)');
        }
        export function down(db) {
          db.exec('DROP TABLE users');
        }
        `
      );

      await fs.writeFile(
        path.join(migrationsDir, '002_posts.ts'),
        `
        export function up(db) {
          db.exec('CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER)');
        }
        export function down(db) {
          db.exec('DROP TABLE posts');
        }
        `
      );
    });

    it('should apply migrations successfully', async () => {
      const result = await migrator.apply();
      expect(result.success).toBe(true);
      expect(result.appliedMigrations).toHaveLength(2);

      // Verify tables exist
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'posts')")
        .all();
      expect(tables).toHaveLength(2);
    });

    it('should handle migration errors', async () => {
      await fs.writeFile(
        path.join(migrationsDir, '003_error.ts'),
        `
        export function up(db) {
          db.exec('INVALID SQL');
        }
        export function down(db) {}
        `
      );

      await expect(migrator.apply()).resolves.toEqual({
        success: false,
        error: expect.any(MigrationExecutionError),
        appliedMigrations: [],
      });
    });

    it('should rollback migrations', async () => {
      // First apply migrations
      await migrator.apply();

      // Then rollback
      const result = await migrator.rollback();
      expect(result.success).toBe(true);
      expect(result.appliedMigrations).toHaveLength(2);

      // Verify tables don't exist
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'posts')")
        .all();
      expect(tables).toHaveLength(0);
    });

    it('should handle concurrent migrations', async () => {
      // Initialize tables
      await migrator.status();

      // Mock the lock to simulate another process holding it
      db.prepare(`UPDATE schema_migrations_lock SET locked = 1 WHERE id = 1`).run();

      const res = await migrator.apply();
      await expect(res.error).toBeDefined();
      await expect(res.error).toBeInstanceOf(MigrationLockError);
      await expect(res.success).toBe(false);
      await expect(res.appliedMigrations).toHaveLength(0);
    });

    it('should handle transaction failures', async () => {
      // Create a migration that will fail in a transaction
      await fs.writeFile(
        path.join(migrationsDir, '003_transaction_error.ts'),
        `
        export function up(db) {
          db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
          throw new Error('Transaction error');
        }
        export function down(db) {}
        `
      );

      const result = await migrator.apply();
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(MigrationExecutionError);

      // Verify transaction was rolled back
      const table = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='test'")
        .get();
      expect(table).toBeUndefined();
    });

    it('should handle lock acquisition and release', async () => {
      // First migration should acquire lock
      const firstMigration = await migrator.apply();

      // Second migration should fail to acquire lock
      const secondMigration = await migrator.apply();

      db.prepare(`UPDATE schema_migrations_lock SET locked = 1 WHERE id = 1`).run();

      // Third migration should fail to acquire lock
      const thirdMigration = await migrator.apply();

      await expect(firstMigration).toEqual(expect.objectContaining({ success: true }));
      await expect(secondMigration).toEqual(
        expect.objectContaining({
          success: true,
        })
      );
      await expect(thirdMigration).toEqual(
        expect.objectContaining({
          success: false,
          error: expect.any(MigrationLockError),
        })
      );
    });

    it('should properly record and remove migrations', async () => {
      // Apply migrations
      await migrator.apply();

      // Check records
      const records = db.prepare('SELECT * FROM schema_migrations ORDER BY batch ASC').all();
      expect(records).toHaveLength(2);
      expect((records[0]! as { batch: number }).batch).toBe(1);

      // Rollback and check records are removed
      await migrator.rollback();
      const remainingRecords = db.prepare('SELECT * FROM schema_migrations').all();
      expect(remainingRecords).toHaveLength(0);
    });
  });

  describe('status and planning', () => {
    beforeEach(async () => {
      await fs.writeFile(
        path.join(migrationsDir, '001_test.ts'),
        `
        export function up(db) {
          db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
        }
        export function down(db) {
          db.exec('DROP TABLE test');
        }
        `
      );
    });

    it('should report correct status', async () => {
      // Initial status
      let status = await migrator.status();
      expect(status.currentBatch).toBe(0);
      expect(status.pending).toBe(1);
      expect(status.applied).toHaveLength(0);

      // After applying migration
      await migrator.apply();
      status = await migrator.status();
      expect(status.currentBatch).toBe(1);
      expect(status.pending).toBe(0);
      expect(status.applied).toHaveLength(1);
    });

    it('should create correct migration plan', async () => {
      const plan = await migrator.plan();
      expect(plan.nextBatch).toBe(1);
      expect(plan.pendingMigrations).toEqual(['001_test.ts']);
    });
  });

  describe('events', () => {
    it('should emit events for migrations', async () => {
      await fs.writeFile(
        path.join(migrationsDir, '001_test.ts'),
        `
        export function up(db) {
          db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
        }
        export function down(db) {
          db.exec('DROP TABLE test');
        }
        `
      );

      const appliedSpy = vi.fn();
      const rolledBackSpy = vi.fn();
      const errorSpy = vi.fn();

      migrator.on('migration:applied', appliedSpy);
      migrator.on('migration:rollback', rolledBackSpy);
      migrator.on('error', errorSpy);

      // Apply migration
      await migrator.apply();
      expect(appliedSpy).toHaveBeenCalledWith('001_test.ts', 1);

      // Rollback migration
      await migrator.rollback();
      expect(rolledBackSpy).toHaveBeenCalledWith('001_test.ts', 1);

      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('should emit events during migration operations', async () => {
      // Create test migrations
      await fs.writeFile(
        path.join(migrationsDir, '001_users.ts'),
        `
        export function up(db) {
          db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)');
        }
        export function down(db) {
          db.exec('DROP TABLE users');
        }
        `
      );

      await fs.writeFile(
        path.join(migrationsDir, '002_posts.ts'),
        `
        export function up(db) {
          db.exec('CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER)');
        }
        export function down(db) {
          db.exec('DROP TABLE posts');
        }
        `
      );

      const events: string[] = [];
      migrator.on('migration:applied', (name) => events.push(`applied:${name}`));
      migrator.on('migration:rollback', (name) => events.push(`rolledback:${name}`));
      migrator.on('error', (error) => events.push(`error:${error.message}`));

      await migrator.apply();
      expect(events).toContain('applied:001_users.ts');
      expect(events).toContain('applied:002_posts.ts');

      await migrator.rollback();
      expect(events).toContain('rolledback:002_posts.ts');
      expect(events).toContain('rolledback:001_users.ts');
    });
  });

  describe('status and planning', () => {
    beforeEach(async () => {
      // Create test migrations
      await fs.writeFile(
        path.join(migrationsDir, '001_users.ts'),
        `
        export function up(db) {
          db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)');
        }
        export function down(db) {
          db.exec('DROP TABLE users');
        }
        `
      );

      await fs.writeFile(
        path.join(migrationsDir, '002_posts.ts'),
        `
        export function up(db) {
          db.exec('CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER)');
        }
        export function down(db) {
          db.exec('DROP TABLE posts');
        }
        `
      );
    });

    it('should return correct migration status', async () => {
      const initialStatus = await migrator.status();
      expect(initialStatus.currentBatch).toBe(0);
      expect(initialStatus.pending).toBe(2); // two test migrations
      expect(initialStatus.applied).toHaveLength(0);

      await migrator.apply();

      const finalStatus = await migrator.status();
      expect(finalStatus.currentBatch).toBe(1);
      expect(finalStatus.pending).toBe(0);
      expect(finalStatus.applied).toHaveLength(2);
    });

    it('should create accurate migration plan', async () => {
      const plan = await migrator.plan();
      expect(plan.nextBatch).toBe(1);
      expect(plan.pendingMigrations).toEqual(['001_users.ts', '002_posts.ts']);

      await migrator.apply();

      const emptyPlan = await migrator.plan();
      expect(emptyPlan.nextBatch).toBe(2);
      expect(emptyPlan.pendingMigrations).toHaveLength(0);
    });
  });

  describe('lock mechanism', () => {
    it('should release lock after error', async () => {
      // Create a migration that will fail
      await fs.writeFile(
        path.join(migrationsDir, '003_error.ts'),
        `
        export function up(db) { throw new Error('Simulated error'); }
        export function down(db) {}
        `
      );

      // Attempt migration (will fail)
      await migrator.apply();

      // Verify lock is released
      const lockStatus = db
        .prepare(`SELECT locked FROM schema_migrations_lock WHERE id = 1`)
        .get() as { locked: number };
      expect(lockStatus.locked).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty migrations directory', async () => {
      // Create new migrator with empty directory
      const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'empty-migrations-'));
      const emptyMigrator = new Migrator({
        db,
        migrationsDir: emptyDir,
      });

      const status = await emptyMigrator.status();
      expect(status.pending).toBe(0);

      // Clean up
      await fs.rm(emptyDir, { recursive: true, force: true });
    });

    it('should handle malformed migration files', async () => {
      await fs.writeFile(
        path.join(migrationsDir, '004_malformed.ts'),
        'export const malformed = true;' // Missing up/down functions
      );

      const res = await migrator.apply();
      await expect(res.error).toBeDefined();
      await expect(res.error).toBeInstanceOf(MigrationError);
      await expect(res.success).toBe(false);
      await expect(res.appliedMigrations).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should handle empty migrations directory', async () => {
      const emptyDir = path.join(tempDir, 'empty');
      await fs.mkdir(emptyDir);

      const emptyMigrator = new Migrator({
        db,
        migrationsDir: emptyDir,
      });

      const plan = await emptyMigrator.plan();
      expect(plan.pendingMigrations).toHaveLength(0);
    });

    it('should handle database connection errors', async () => {
      // Close the database to simulate connection error
      db.close();

      await expect(migrator.apply()).resolves.toEqual({
        success: false,
        error: expect.any(MigrationError),
        appliedMigrations: [],
      });
    });

    it('should handle partial batch failures', async () => {
      // Create multiple migrations where one will fail
      await fs.writeFile(
        path.join(migrationsDir, '001_success.ts'),
        `
        export function up(db) {
          db.exec('CREATE TABLE success (id INTEGER PRIMARY KEY)');
        }
        export function down(db) {
          db.exec('DROP TABLE success');
        }
        `
      );

      await fs.writeFile(
        path.join(migrationsDir, '002_fail.ts'),
        `
        export function up(db) {
          db.exec('INVALID SQL');
        }
        export function down(db) {}
        `
      );

      const result = await migrator.apply();
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(MigrationExecutionError);
      expect(result.appliedMigrations).toHaveLength(0);

      // No migrations should have been applied in the transaction
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'success'")
        .all();
      expect(tables).toHaveLength(0);
    });
  });

  describe('advanced scenarios', () => {
    it('should handle large batches of migrations', async () => {
      // Create 10 migrations
      for (let i = 1; i <= 10; i++) {
        const num = i.toString().padStart(3, '0');
        await fs.writeFile(
          path.join(migrationsDir, `${num}_table.ts`),
          `
          export function up(db) {
            db.exec('CREATE TABLE table_${num} (id INTEGER PRIMARY KEY)');
          }
          export function down(db) {
            db.exec('DROP TABLE table_${num}');
          }
          `
        );
      }

      const result = await migrator.apply();
      expect(result.success).toBe(true);
      expect(result.appliedMigrations).toHaveLength(10);

      // Verify all tables were created
      const tables = db
        .prepare(
          "SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name LIKE 'table_%'"
        )
        .get() as { count: number };
      expect(tables.count).toBe(10);
    });
  });

  describe('additional test cases', () => {
    it('should handle initialization errors', async () => {
      const invalidDb = {
        prepare: () => {
          throw new Error('Database error');
        },
      } as unknown as Database;

      const errorMigrator = new Migrator({
        db: invalidDb,
        migrationsDir,
      });

      await expect(errorMigrator.status()).rejects.toThrow('Failed to initialize migrator');
    });

    it('should handle file system errors during migration loading', async () => {
      // Create an unreadable directory
      const unreadableDir = path.join(tempDir, 'unreadable');
      await fs.mkdir(unreadableDir);
      await fs.chmod(unreadableDir, 0o000);

      const errorMigrator = new Migrator({
        db,
        migrationsDir: unreadableDir,
      });

      await expect(errorMigrator.plan()).rejects.toThrow();

      // Cleanup
      await fs.chmod(unreadableDir, 0o755);
    });

    it('should handle transaction errors', async () => {
      const errorDb = {
        ...db,
        transaction: () => {
          throw new Error('Transaction error');
        },
      } as unknown as Database;

      const errorMigrator = new Migrator({
        db: errorDb,
        migrationsDir,
      });

      await fs.writeFile(
        path.join(migrationsDir, '001_test.ts'),
        `
        export function up(db) { db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)'); }
        export function down(db) { db.exec('DROP TABLE test'); }
        `
      );

      const result = await errorMigrator.apply();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
