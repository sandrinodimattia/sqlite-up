import { Database } from 'better-sqlite3';

/**
 * Define the types of events the Migrator can emit.
 */
export interface MigratorEvents {
  /**
   * Emitted when a migration is successfully applied.
   * @param migrationName The name of the migration applied.
   * @param batch The batch number of the migration.
   */
  migrationApplied: (migrationName: string, batch: number) => void;

  /**
   * Emitted when a migration is successfully rolled back.
   * @param migrationName The name of the migration rolled back.
   * @param batch The batch number of the migration.
   */
  migrationRolledBack: (migrationName: string, batch: number) => void;
}

/**
 * Extend EventEmitter to include typed events.
 */
declare interface Migrator {
  on<U extends keyof MigratorEvents>(event: U, listener: MigratorEvents[U]): this;
  emit<U extends keyof MigratorEvents>(event: U, ...args: Parameters<MigratorEvents[U]>): boolean;
}

/**
 * Options for initializing the Migrator.
 */
export interface MigratorOptions {
  /**
   * SQLite database instance
   */
  db: Database;

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
}

/**
 * Represents a single migration file/module.
 */
export interface Migration {
  /**
   * Name of the migration (derived from filename)
   */
  name: string;

  /**
   * Function to apply the migration
   */
  up: (db: Database) => void;

  /**
   * Function to revert the migration
   */
  down: (db: Database) => void;
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
