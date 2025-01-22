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
import { Database } from 'better-sqlite3';

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
import { Database } from 'better-sqlite3';
import { Migrator } from 'sqlite-up';

async function main() {
  const db = new Database('myapp.db');

  const migrator = new Migrator({
    db,
    migrationsDir: './migrations',
  });

  // Run all pending migrations
  const result = await migrator.apply();
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

##### `apply()`

Apply all pending migrations.

```typescript
const migrator = new Migrator({
  db,
  migrationsDir: './migrations',
});

// Run all pending migrations
const result = await migrator.apply();
if (result.success) {
  console.log('Applied migrations:', result.appliedMigrations);
} else {
  console.error('Migration failed:', result.error);
}
```

##### `rollback()`

Rollback the most recent batch of migrations.

```typescript
// Rollback the last batch of migrations
const result = await migrator.rollback();
if (result.success) {
  console.log('Rolled back:', result.appliedMigrations);
} else {
  console.error('Rollback failed:', result.error);
}
```

##### `status()`

Get the status of all migrations. Shows which migrations have been applied and which are pending.

```typescript
const status = await migrator.status();
console.log('Migration Status:', status);
// Example output:
// Migration Status: {
//   currentBatch: 1,
//   pending: 0,
//   applied: [
//     {
//       name: '001_users_table.ts',
//       executed_at: '2025-01-22T12:29:22.402Z',
//       batch: 1
//     },
//     {
//       name: '002_add_age.ts',
//       executed_at: '2025-01-22T12:29:22.406Z',
//       batch: 1
//     }
//   ]
// }
```

##### `plan()`

Plan the pending migrations without applying them. Returns the next batch number and the list of pending migration names in order.

```typescript
const plan = await migrator.plan();
console.log('Migration Plan:', plan);
// Example output:
// Migration Plan: {
//   nextBatch: 2,
//   pending: ['003_add_email_index.ts']
// }
```

##### Events

The migrator extends EventEmitter and emits events during migration:

```typescript
// Listen for migration events
migrator.on('migration:applied', function (name: string, batch: number): void {
  console.log(`✅ Migration Applied: "${name}" in batch ${batch}`);
});
migrator.on('migration:rollback', function (name: string, batch: number): void {
  console.log(`🔄 Migration Rolled Back: "${name}" from batch ${batch}`);
});

// Run migrations after setting up listeners
await migrator.apply();
```

##### Transaction Safety

All migrations are run within a transaction. If any part of a migration fails, the entire migration is rolled back:

```typescript
export const up = (db: Database): void => {
  // Both operations will be in the same transaction
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)');
  db.exec('CREATE INDEX idx_user_id ON users(id)');

  // If any operation fails, the entire migration is rolled back
  // and the database remains in its previous state
};
```

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
  await migrator.apply();
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
