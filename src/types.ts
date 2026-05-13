/**
 * A value or a promise for that value.
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Result returned by SQLite statement execution.
 */
export interface SqliteRunResult {
  /**
   * Number of rows changed by the statement, when reported by the driver.
   */
  changes?: number | bigint;

  /**
   * Last inserted row identifier, when reported by the driver.
   */
  lastInsertRowid?: number | bigint;
}

/**
 * Minimal prepared statement surface used by sqlite-up.
 * Compatible with Node's `node:sqlite`, Bun's `bun:sqlite`, Bun SQL, and
 * similar SQLite clients.
 */
export interface SqliteStatement {
  /**
   * Runs the prepared statement and returns all result rows.
   */
  all(...params: unknown[]): MaybePromise<unknown[]>;

  /**
   * Runs the prepared statement and returns the first result row.
   */
  get(...params: unknown[]): MaybePromise<unknown>;

  /**
   * Runs the prepared statement for side effects and returns the driver result.
   */
  run(...params: unknown[]): MaybePromise<SqliteRunResult | unknown>;
}

/**
 * Transaction function returned by SQLite drivers that provide native
 * async-compatible transaction wrappers.
 */
export interface SqliteTransaction<Args extends unknown[] = unknown[], Result = unknown> {
  (...args: Args): MaybePromise<Result>;

  /**
   * Runs the transaction with deferred locking semantics when supported.
   */
  deferred?: (...args: Args) => MaybePromise<Result>;

  /**
   * Runs the transaction with immediate locking semantics when supported.
   */
  immediate?: (...args: Args) => MaybePromise<Result>;

  /**
   * Runs the transaction with exclusive locking semantics when supported.
   */
  exclusive?: (...args: Args) => MaybePromise<Result>;
}

/**
 * Minimal SQLite database surface passed to migration files.
 * Node 24+ `DatabaseSync`, Bun `Database`, better-sqlite3 `Database`,
 * and Bun SQL adapters are structurally compatible with this interface.
 */
export interface SqliteDatabase {
  /**
   * Executes one or more SQL statements without returning result rows.
   */
  exec(sql: string): MaybePromise<unknown>;

  /**
   * Prepares a SQL statement for repeated execution.
   */
  prepare(sql: string): SqliteStatement;
}

/**
 * Structural subset of Bun's Promise-based SQL client when configured for SQLite.
 * sqlite-up wraps this into the `SqliteDatabase` migration surface.
 */
export interface BunSqliteDatabase {
  /**
   * Executes raw SQL through Bun SQL and returns all result rows.
   */
  unsafe(sql: string, params?: unknown[]): PromiseLike<unknown[]> | unknown[];

  /**
   * Runs a callback inside a Bun SQL transaction when supported.
   */
  begin?<Result>(fn: (tx: BunSqliteDatabase) => MaybePromise<Result>): MaybePromise<Result>;
}

/**
 * Database instances accepted by `Migrator`.
 */
export type MigratorDatabase = SqliteDatabase | BunSqliteDatabase;

/**
 * Options for initializing the Migrator.
 */
export interface MigratorOptions {
  /**
   * SQLite database instance
   */
  db: MigratorDatabase;

  /**
   * Directory containing migration files
   */
  migrationsDir: string;

  /**
   * Name of the migrations table (default: schema_migrations)
   */
  migrationsTable?: string;

  /**
   * Name of the migrations lock table (default: schema_migrations_lock)
   */
  migrationsLockTable?: string;

  /**
   * File extensions to look for when loading migrations (default: ['ts', 'js'])
   * Note: .d.ts files are always ignored
   */
  fileExtensions?: string[];
}

/**
 * Represents a single migration file/module.
 */
export interface Migration<T = any> {
  /**
   * Function to apply the migration
   */
  up: (db: SqliteDatabase, ctx?: T) => MaybePromise<void>;

  /**
   * Function to revert the migration
   */
  down: (db: SqliteDatabase, ctx?: T) => MaybePromise<void>;
}

/**
 * Represents a single migration file/module after being loaded
 */
export interface NamedMigration<T = any> extends Migration<T> {
  /**
   * Name of the migration (derived from filename)
   */
  name: string;
}

/**
 * A record of applied migrations as stored in the database.
 */
export interface MigrationRecord {
  /**
   * Name of the migration
   */
  name: string;

  /**
   * ISO timestamp when the migration was executed
   */
  executed_at: string;

  /**
   * Batch number for the migration
   */
  batch: number;
}

/**
 * Result type returned by migration actions.
 */
export interface MigrationResult {
  /**
   * Whether the migration operation was successful
   */
  success: boolean;

  /**
   * Error if the operation failed
   */
  error?: Error;

  /**
   * List of migrations that were applied/rolled back
   */
  appliedMigrations: string[];
}

/**
 * Represents the plan for pending migrations.
 */
export interface MigrationPlan {
  /**
   * The next batch number that will be used
   */
  nextBatch: number;

  /**
   * List of migrations that will be applied
   */
  pendingMigrations: string[];
}

/**
 * Represents the status of migrations.
 */
export interface MigrationStatus {
  /**
   * Current highest batch number
   */
  currentBatch: number;

  /**
   * Number of pending migrations
   */
  pending: number;

  /**
   * List of applied migrations
   */
  applied: MigrationRecord[];
}
