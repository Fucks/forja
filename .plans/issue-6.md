# Issue #6: SQLite com Drizzle e migrador por domínio

## Decisions

- `migrate.ts` owns `Migration`, `loadMigrations`, `applyMigrations` and `MigrationFailedError`
  (message cites `<id>.sql`; the failed migration's transaction is rolled back, so its id isn't recorded).
- `applyMigrations` creates `_migrations` with `CREATE TABLE IF NOT EXISTS` before reading applied ids, so it
  works with any migrations dir (tests use temp dirs); `0001_init.sql` also uses `IF NOT EXISTS`.
- `client.ts` owns `ForjaDb`, `DatabaseHandle`, `openDatabase`; default migrations dir comes from the existing
  `runtimeAssetPath("migrations")` in `src/lib/paths.ts` (already handles dev vs `dist/migrations`).
- Pragmas set before migrations (foreign_keys is a no-op inside a transaction); WAL skipped for `:memory:`.
- `schema/meta.ts`: Drizzle tables `appliedMigrations` (`_migrations`) and `appMeta` (`app_meta`).
- `main.ts`: `startServer(deps: ServerDeps)` where `ServerDeps = Omit<AppDeps, "db">`; it opens the db at
  `paths.database` and closes it on Fastify `onClose`. `cli.ts` stays unchanged.

## Tasks

- [x] 1. Test + implement `loadMigrations` reads `*.sql` sorted by name — `src/server/db/migrate.ts`, `migrate.test.ts`
- [x] 2. Test + implement `applyMigrations` applies in lexical order and records ids — `migrate.ts`
- [ ] 3. Test + implement idempotency (skips applied ids; opening a file db twice applies once) — `migrate.ts`, `client.ts`
- [ ] 4. Test + implement failure aborts with error citing the file and doesn't record the id — `migrate.ts`
- [ ] 5. Test + implement pragmas: `foreign_keys` on, WAL on file db, busy_timeout — `client.ts`
- [ ] 6. `0001_init.sql` + `schema/meta.ts`; `createTestDb()` in `src/test/test_db.ts` with a test that it has `app_meta`
- [ ] 7. Integrate: `AppDeps.db`, `main.ts` opens/closes db, update `app.test.ts`
- [ ] 8. Self-review checklist and feedback loops (typecheck, lint, test)
