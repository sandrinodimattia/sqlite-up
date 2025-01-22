import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`
    ALTER TABLE users ADD COLUMN age INTEGER DEFAULT 0;
  `);
}

export function down(db: Database): void {
  // SQLite does not support DROP COLUMN directly. To remove a column:
  db.exec(`
    CREATE TABLE users_backup (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
  `);
  db.exec(`
    INSERT INTO users_backup (id, username, email, created_at)
    SELECT id, username, email, created_at FROM users;
  `);
  db.exec(`DROP TABLE users;`);
  db.exec(`ALTER TABLE users_backup RENAME TO users;`);
}
