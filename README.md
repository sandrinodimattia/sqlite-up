# sqlite-up

[![npm version](https://badge.fury.io/js/sqlite-up.svg)](https://badge.fury.io/js/sqlite-up)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A lightweight SQLite migration system for Node.js, built with TypeScript. Manage your SQLite database schema changes with ease and confidence.

## Features

- 🚀 Modern TypeScript-first API
- 🔒 Concurrency-safe with database locking
- ⚡️ Lightweight and fast
- 🔄 Supports migrations and rollbacks
- 📊 Migration status tracking
- 🔐 Transaction-safe migrations

## Installation

```bash
npm install sqlite-up better-sqlite3
# or
yarn add sqlite-up better-sqlite3
# or
pnpm add sqlite-up better-sqlite3
```

## Quick Start

1. Create a migrations directory:

```bash
mkdir migrations
```

2. Create your first migration file `migrations/001_create_users.ts`:

```typescript
import { MigrationPlan } from 'sqlite-up';

export const up = (db: Database): void => {
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

export const down = (db: Database): void => {
  db.exec('DROP TABLE users');
};
```

3. Use the migrator in your code:

```typescript
import Database from 'better-sqlite3';
import { Migrator } from 'sqlite-up';

async function main() {
  const db = new Database('myapp.db');

  const migrator = new Migrator({
    db,
    migrationsDir: './migrations',
  });

  // Run all pending migrations
  const result = await migrator.migrateUp();
  if (result.success) {
    console.log('Applied migrations:', result.appliedMigrations);
  } else {
    console.error('Migration failed:', result.error);
  }
}

main().catch(console.error);
```

## API Reference

### `Migrator`

The main class for managing migrations.

#### Constructor Options

```typescript
interface MigratorOptions {
  db: Database; // better-sqlite3 database instance
  migrationsDir: string; // Directory containing migration files
  migrationsTable?: string; // Optional: Table name for tracking migrations (default: 'schema_migrations')
  migrationsLockTable?: string; // Optional: Table name for migration locks (default: 'schema_migrations_lock')
}
```

#### Methods

- `migrateUp(): Promise<MigrationResult>` - Apply all pending migrations
- `migrateDown(steps?: number): Promise<MigrationResult>` - Rollback migrations
- `status(): Promise<MigrationStatus[]>` - Get the status of all migrations
- `reset(): Promise<MigrationResult>` - Rollback all migrations

## Migration Files

Migration files should be TypeScript or JavaScript files that export `up` and `down` functions:

```typescript
import { Database } from 'better-sqlite3';

export const up = (db: Database): void => {
  // Migration code here
};

export const down = (db: Database): void => {
  // Rollback code here
};
```

Files should be named using the format: `XXX_description.ts` where XXX is a sequence number (e.g., `001_`, `002_`).

## Error Handling

```typescript
import {
  SqliteUpError, // Base error class
  MigrationFileError, // Issues with migration files
  MigrationLockError, // Locking-related errors
  MigrationExecutionError, // Errors during migration execution
} from 'sqlite-up';

try {
  await migrator.migrateUp();
} catch (error) {
  if (error instanceof MigrationLockError) {
    console.error('Migration failed, a different process is holding the lock:', error.message);
  }
}
```

The library provides specific error classes for different scenarios:

- `MigrationError` - Base error class
- `MigrationFileError` - Issues with migration files
- `MigrationExecutionError` - Errors during migration execution
- `MigrationLockError` - Lock-related errors

## Examples

Check out the [example directory](./example) for complete working examples.

## Contributing

### Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Build the project
pnpm build

# Lint the code
pnpm lint

# Format the code
pnpm format
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
