# sqlite-up Examples

Each supported SQLite provider has its own self-contained example folder with a dedicated `README.md`, entry point, and migrations.

Build the library from the repository root first:

```bash
pnpm run build
```

Then install and run the provider example you want:

```bash
cd examples/node-sqlite
pnpm install
pnpm start

cd ../better-sqlite3
pnpm install
pnpm start

cd ../bun-sqlite
bun install
bun start

cd ../bun-sql
bun install
bun start
```
