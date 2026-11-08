# Issue #49: Persistência de runs, NodeRuns, artefatos e snapshot do scheduler

## Decisions

- `RunRepository` is async (Promise-based, per contract); the SQLite implementation wraps the sync
  better-sqlite3 calls. `SqliteRunRepository(db, clock)` — the clock stamps `run_snapshots.updated_at`.
- Dates are stored as ISO text and come back as `Date` in `RunRecord`/`NodeRunState`;
  `ArtifactRecord.createdAt` stays a string (contract).
- `runs.project_id` has no FK (the issue only lists `node_runs.run_id` FK); `artifacts` has FKs to
  `runs` and `node_runs`.
- `failed_item_ids_json` holds `RunRecord.failedItemIds`. `saveTransition({ run })` updates every
  state column (nulls clear `pauseReason`/`resumeAt`) and overwrites failed items only when
  `run.failedItems` is set. Reads return `failedItemIds`; `failedItems` is left unset.
- `saveTransition` belongs to one run: its id comes from `run`, else the first NodeRun, else the first
  artifact (`findTransitionRunId`). A run that doesn't exist → `RunNotFoundError` (both implementations),
  and the whole transition is rolled back.
- `listRuns` cursor `before` is a run id: returns runs strictly after it in (`created_at` desc, `id` desc).
  Empty/absent `status` means no status filter.
- NodeRuns and artifacts are listed in insertion order (SQLite `rowid`, `Map` order in the fake);
  upserts keep the original position.
- `latestNodeRunsByItem` returns, for every requested item id, the NodeRuns of that item in the most
  recent run (by `created_at`) of the project that touched it; `[]` when none.
- Row ↔ domain mapping and Zod schemas for JSON columns live in `src/server/runs/run_rows.ts`
  (extra file, keeps the repository short). Snapshots are stored as JSON; the fake round-trips through
  JSON too so both behave alike.
- Test factories `buildRunRecord`/`buildArtifactRecord` in `src/test/factories/run_record_factory.ts`.
- Contract suite in `sqlite_run_repository.test.ts` runs both implementations via `describe.each`.

## Tasks

- [x] 1. Migration `0600_runs.sql` and Drizzle schema `src/server/db/schema/runs.ts`
- [x] 2. Contracts `RunRecord`, `ArtifactRecord`, `RunRepository`, `RunNotFoundError` — `src/server/runs/run_repository.ts`
- [ ] 3. Test + implement `createRun`/`getRun` round-trip with Dates (both implementations) — repo, fake, rows, factory
- [ ] 4. Test + implement `saveTransition` of run state (pause cleared, failed items) and unknown run rejection
- [ ] 5. Test + implement NodeRun upsert, `listNodeRuns`, `getNodeRun`
- [ ] 6. Test + implement artifacts (`listArtifacts`) and snapshot (`getSnapshot`)
- [ ] 7. Test + implement atomicity: failure mid-transition leaves nothing partial
- [ ] 8. Test + implement `listRuns` pagination by `created_at` desc and flow/status filters
- [ ] 9. Test + implement `listActiveRuns` (QUEUED, RUNNING, PAUSED only)
- [ ] 10. Test + implement `latestNodeRunsByItem`
- [ ] 11. Self-review checklist and feedback loops (typecheck, lint, test)
