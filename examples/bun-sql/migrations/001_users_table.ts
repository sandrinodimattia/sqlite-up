import type { SqliteDatabase } from 'sqlite-up';

export async function up(db: SqliteDatabase): Promise<void> {
  await db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
  `);
}

export async function down(db: SqliteDatabase): Promise<void> {
  await db.exec(`DROP TABLE IF EXISTS users;`);
}
