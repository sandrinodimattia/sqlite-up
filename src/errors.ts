/**
 * Base error class for all sqlite-up errors
 */
export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

/**
 * Thrown when there's an issue with migration files
 */
export class MigrationFileError extends MigrationError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'MigrationFileError';
  }
}

/**
 * Thrown when there's a locking issue
 */
export class MigrationLockError extends MigrationError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'MigrationLockError';
  }
}

/**
 * Thrown when there's an issue during migration execution
 */
export class MigrationExecutionError extends MigrationError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'MigrationExecutionError';
  }
}
