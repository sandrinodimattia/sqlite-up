import path from 'path';
import { fileURLToPath } from 'url';
import SQLiteDatabase from 'better-sqlite3';

import { Migrator, MigrationResult, MigrationPlan } from '../dist/index.js';

async function main() {
  // Get the current directory path
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  // 1. Open the SQLite database
  const db = new SQLiteDatabase(path.join(__dirname, 'mydatabase.sqlite'));
  db.pragma('foreign_keys = ON');

  // 2. Initialize the Migrator
  const migrator = new Migrator({
    db,
    migrationsDir: path.join(__dirname, 'migrations'),
    // Optional overrides:
    // migrationsTable: 'schema_migrations',
    // migrationsLockTable: 'schema_migrations_lock',
  });

  // 3. Attach event listeners for logging
  migrator.on('migration:applied', function (name: string, batch: number): void {
    console.log(`✅ Migration Applied: "${name}" in batch ${batch}`);
  });
  migrator.on('migration:rollback', function (name: string, batch: number): void {
    console.log(`🔄 Migration Rolled Back: "${name}" from batch ${batch}`);
  });

  // 4. Check migration status
  const statusBefore = await migrator.status();
  console.log('----------------------------------------');
  console.log('Migration Status:', statusBefore);

  // 5. Plan pending migrations
  try {
    console.log('----------------------------------------');
    console.log('Generating migration plan...');
    const plan: MigrationPlan = await migrator.plan();
    if (plan.pendingMigrations.length === 0) {
      console.log('No pending migrations to apply.');
    } else {
      console.log(`Upcoming Batch: ${plan.nextBatch}`);
      console.log('Pending Migrations:');
      plan.pendingMigrations.forEach((migration, index) => {
        console.log(`  ${index + 1}. ${migration}`);
      });
    }
  } catch (err) {
    console.error('Failed to generate migration plan:', err);
    process.exit(1);
  }

  // 6. Apply all pending migrations
  console.log('----------------------------------------');
  console.log('Applying pending migrations...');
  const upResult: MigrationResult = await migrator.apply();
  if (!upResult.success) {
    console.error('Migration up failed:', upResult.error);
    process.exit(1); // Exit if migration failed
  }

  // 7. Check migration status
  const statusAfter = await migrator.status();
  console.log('----------------------------------------');
  console.log('Migration Status:', statusAfter);

  // 8. (Optional) Rollback the last batch of migrations
  // console.log('----------------------------------------');
  // console.log('Rolling back last batch of migrations...');
  // const rollbackResult: MigrationResult = await migrator.rollback();
  // if (rollbackResult.success) {
  //   console.log('Migrations rolled back:', rollbackResult.appliedMigrations);
  // } else {
  //   console.error('Rollback failed:', rollbackResult.error);
  // }

  // 9. Close the database connection when done
  db.close();
}

main().catch((err) => {
  console.error('An unexpected error occurred:', err);
  process.exit(1);
});
