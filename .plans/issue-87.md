# Issue #87: Retenção e limpeza de logs e workspaces

## Decisions

- `planCleanup` (pure) in `src/server/maintenance/plan_cleanup.ts` with the contract types. An inactive
  dir without `finishedAt` (its run is gone from the database) counts as expired: nobody can open it.
  The ceiling counts every dir (active ones included) but only inactive ones are deleted, oldest first.
- The log store learns the sizes from `log_index` (no fs walk): `LogStore.listRunLogSizes()` →
  `{ runId, bytes }[]`. `LogStore.expireRun(runId)` deletes like `deleteRun` and records the run in the
  new table `expired_run_logs` (migration `0611_expired_run_logs.sql`, schema next to `log_index`);
  `LogStore.hasExpired(runId)` answers the 410 check.
- `runCleanup` contract deps + two extensions the spec implies: `worktreesDir` (= `paths.worktrees`) and
  `runtime: Pick<AgentRuntime, "listOpenWorkspaces" | "closeWorkspace">` for the `forja.workspace`
  containers of runs that are not active.
- Worktrees: `GitProvider` gains `pruneWorktrees(root)` and `listWorktreePaths(root)` (CliGitProvider +
  FakeGitProvider). `worktree_manager.ts` reuses `listWorktreePaths` instead of its own parser.
  Orphan = directory in `<worktreesDir>/<projectId>/` that git does not list; registered ones (every
  active run's worktree) are kept. Removal uses `node:fs/promises` (`rm` recursive).
- Daily job: `src/server/maintenance/cleanup_job.ts` (`createCleanupJob`) arms one timer at the next
  `0 3 * * *` in the host timezone via `nextFireAt`; `runNow()` shares an in-flight cleanup. Started by
  `onReady`/stopped by `onClose` in `logs_routes.ts`; `POST /api/maintenance/cleanup` calls `runNow()`.
- 410: logs routes reply `{ error: { code: "logs_expired", message } }` with status 410 when the
  NodeRun's run has expired logs. Web hook maps 410 to "Logs removidos pela política de retenção".
- Diagnostics: `createForjaDiskUsageCheck(readUsage)` in `diagnostic_checks.ts`, item id `forja-disk`,
  label "Espaço em disco da Forja"; warning at ≥ 90 % of `logMaxTotalMb`. `formatMegabytes` in
  `src/lib/format.ts`.

## Tasks

- [x] 1. Test+impl: `planCleanup` removes inactive runs finished more than `retentionDays` ago, never active ones — `plan_cleanup.ts`, `plan_cleanup.test.ts`
- [x] 2. Test+impl: `planCleanup` removes the oldest kept inactive runs until the total fits the ceiling (active ones count but stay; orphans without `finishedAt` are expired) — same files
- [x] 3. Test+impl: `LogStore.listRunLogSizes` sums the bytes of each run — `log_store.ts`, `log_store.test.ts`
- [x] 4. Test+impl: `LogStore.expireRun` + `hasExpired` with migration `0611_expired_run_logs.sql` — `log_store.ts`, schema `log_index.ts`
- [x] 5. Test+impl: `GitProvider.pruneWorktrees` / `listWorktreePaths` in CliGitProvider and FakeGitProvider; worktree_manager reuses it
- [x] 6. Test+impl: `runCleanup` expires the planned runs' logs and reports deleted runs and freed bytes — `cleanup_service.ts`, `cleanup_service.test.ts`
- [x] 7. Test+impl: `runCleanup` prunes git worktrees and removes orphaned worktree dirs, keeping registered ones — same files
- [x] 8. Test+impl: `runCleanup` closes `forja.workspace` containers of runs that are not active — same files
- [x] 9. Test+impl: `createCleanupJob` fires at 03:00 local, re-arms daily, `runNow` shares the in-flight cleanup — `cleanup_job.ts`, `cleanup_job.test.ts`
- [x] 10. Test+impl: `POST /api/maintenance/cleanup` and job hooks — `logs_routes.ts`, `logs_routes.test.ts`
- [x] 11. Test+impl: logs routes answer 410 `logs_expired` for expired runs — `logs_routes.ts`, `logs_routes.test.ts`
- [x] 12. Test+impl: `useNodeRunLogs` turns a 410 into "Logs removidos pela política de retenção" — `use_node_run_logs.ts`, test
- [ ] 13. Test+impl: diagnostic item "Espaço em disco da Forja" — `diagnostic_checks.ts`, `diagnostics_routes.ts`, tests
- [ ] 14. Self-review checklist (section 5) and feedback loops (section 6)
