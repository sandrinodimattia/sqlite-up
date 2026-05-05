import type { SqliteDatabase } from 'sqlite-up';

export async function up(db: SqliteDatabase): Promise<void> {
  await db.exec(`
    ALTER TABLE users ADD COLUMN age INTEGER DEFAULT 0;
  `);
}

export async function down(db: SqliteDatabase): Promise<void> {
  // SQLite does not support DROP COLUMN directly. To remove a column:
  await db.exec(`
    CREATE TABLE users_backup (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
  `);
  await db.exec(`
    INSERT INTO users_backup (id, username, email, created_at)
    SELECT id, username, email, created_at FROM users;
  `);
  await db.exec(`DROP TABLE users;`);
  await db.exec(`ALTER TABLE users_backup RENAME TO users;`);
}
