# Issue #58: Log store NDJSON por NodeRun com redação de segredos

## Decisions

- `src/shared/log_types.ts`: `LOG_EVENT_KINDS`, `storedLogEventSchema` (Zod) and `StoredLogEvent = z.infer`,
  `LogPage`, `logPageQuery` (`fromSeq` default 1, `limit` default 500, max 2 000). Shared cannot import
  `integrations/`, so the kinds are listed there; the exhaustive switch in `log_store.ts` keeps them in sync
  with `AgentEvent["kind"]`.
- `LogStore` (`src/server/runtime/log_store.ts`) keeps the contract of the issue. File:
  `<logsDir>/<runId>/<nodeRunId>.ndjson`. The `log_index` row gives the `runId` of a NodeRun (read, rawStream)
  and the next `seq` (count + 1). Appends are serialized per NodeRun with a promise queue.
- `FsLike` = the promise fs functions it uses + `createReadStream`; default is `node:fs`. Tests of the store use
  a temp dir (they read the file); the executor test bed and `createTestAppDeps` use an in-memory `FsLike`
  fake (`src/test/fakes/in_memory_fs.ts`) so they never touch disk.
- `log_index` has no FK to `node_runs` (retention #87 deletes files and rows together via `deleteRun`).
- `log.appended` throttling lives in `src/server/runtime/log_announcer.ts` (`createLogAnnouncer`): the first
  appended seq opens a range and a 250 ms `clock.setTimeout`; when it fires, `{ fromSeq, toSeq }` is published.
  `ActiveRun` appends each agent event in the background, then hands the seq to the announcer.
- Executor deps gain `logs: LogStore` (ExecutorDeps, ActiveRunDeps, AppExecutorDeps).
- Routes 404 when the NodeRun does not exist (checked via `SqliteRunRepository.getNodeRun`).
- `main.ts`: one redactor shared by the app and the log store; docker runtime with host uid/gid (null on Windows).

## Tasks

- [x] 1. Log types, `log_index` migration and Drizzle schema — `src/shared/log_types.ts`, `0610_log_index.sql`, `schema/log_index.ts`
- [x] 2. Test + implement append/read in seq order with range — `log_store.ts`, `log_store.test.ts`
- [x] 3. Test + implement redaction of every text field (test reads the file) — `log_store.ts`
- [x] 4. Test concurrent appends keep `seq` continuous and lines intact — `log_store.test.ts`
- [x] 5. Test + implement `stats` from the index — `log_store.ts`
- [x] 6. Test + implement `deleteRun` — `log_store.ts`
- [x] 7. Test + implement `rawStream` returns the full NDJSON — `log_store.ts`
- [x] 8. Test + implement the 250 ms `log.appended` announcer — `log_announcer.ts`, `log_announcer.test.ts`
- [x] 9. In-memory `FsLike` fake; `logs` in ExecutorDeps/ActiveRun/AppExecutor; executor test that events are stored and announced — `active_run.ts`, `node_run_execution.ts`, `node_executors.ts`, `run_events.ts`, `executor.ts`, `app_executor.ts`, test bed
- [x] 10. `AppDeps.logs` and `main.ts` (shared redactor, docker runtime) — `app.ts`, `main.ts`, `test_app_deps.ts`
- [x] 11. Test + implement `GET /api/node-runs/:id/logs` paging — `logs_routes.ts`, `logs_routes.test.ts`
- [x] 12. Test + implement `GET /api/node-runs/:id/logs/raw` download — `logs_routes.ts`
- [x] 13. Self-review checklist and feedback loops
