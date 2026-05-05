import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { type MigrationPlan, type MigrationResult, Migrator } from 'sqlite-up';

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const db = new DatabaseSync(path.join(__dirname, 'node-sqlite.sqlite'));
  db.exec('PRAGMA foreign_keys = ON');

  const migrator = new Migrator({
    db,
    migrationsDir: path.join(__dirname, 'migrations'),
  });

  migrator.on('migration:applied', (name: string, batch: number): void => {
    console.log(`Migration applied: "${name}" in batch ${batch}`);
  });

  const plan: MigrationPlan = await migrator.plan();
  console.log('Migration plan:', plan);

  const result: MigrationResult = await migrator.apply();
  if (!result.success) {
    console.error('Migration failed:', result.error);
    process.exit(1);
  }

  console.log('Migration status:', await migrator.status());

  if (db.isOpen) {
    db.close();
  }
}

main().catch((err) => {
  console.error('An unexpected error occurred:', err);
  process.exit(1);
});
