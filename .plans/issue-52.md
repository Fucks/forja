# Issue #52: Recuperação de runs após reinício do servidor

## Decisions

- `node_run_interrupted` keeps the **same NodeRun and attempt**: RUNNING → INTERRUPTED (error
  `{ kind: "interrupted" }`, saved and published) → QUEUED (startedAt/error cleared, original `queuedAt`
  kept so it keeps its place in the queue). A run that is stopping cancels it instead
  (INTERRUPTED → CANCELED). Ignored when the NodeRun is no longer RUNNING (idempotent).
- `requeueAfterUsageLimit` (usage_pause.ts) moves to `node_run_state.ts` as `requeueSameAttempt`,
  reused by the usage limit and the interruption; its tests move with it.
- Stored snapshots are checked at the boundary by `isSchedulerSnapshotOfRun` in
  `src/server/runtime/stored_snapshot.ts` (Zod, loose object, type guard — no cast).
- `wakeupTimesOf(snapshot)` in `src/engine/scheduler_snapshot.ts`: usage-limit `resumeAt` and `queuedAt`
  of QUEUED NodeRuns — the timers that died with the previous process.
- `Executor` interface gains `resumeFromSnapshot(run, snapshot)`; ActiveRun gains
  `resumeAfterRestart(snapshot)`: delivers `node_run_interrupted` for each RUNNING NodeRun, reschedules
  the wakeups, then ticks (a past `resumeAt` resumes right away).
- `recoverRuns` closes **all** open workspaces first (before any run reopens one), then resumes each
  active run. Missing/invalid snapshot → run FAILED with "estado perdido no reinício", written directly
  (the state machine has no QUEUED/PAUSED → FAILED). Other resume errors → FAILED too, reason in report.
  `resumed` vs `stillPaused` decided by re-reading the run after resuming.
- main.ts: executor created before `buildApp`, `recoverRuns` runs before `app.listen`, log = console.log.

## Tasks

- [x] 1. Refactor: move `requeueAfterUsageLimit` to `node_run_state.ts` as `requeueSameAttempt` (+ tests)
- [x] 2. Test + implement `node_run_interrupted` requeues the same attempt — `scheduler_types.ts`, `scheduler.ts`, `scheduler.test.ts`, `scheduler_harness.ts`
- [x] 3. Test + implement: a stopping run cancels the interrupted NodeRun — `scheduler.ts`, `scheduler.test.ts`
- [x] 4. Test + implement `wakeupTimesOf` — `scheduler_snapshot.ts` (+ test)
- [x] 5. Test + implement `isSchedulerSnapshotOfRun` — `src/server/runtime/stored_snapshot.ts` (+ test)
- [ ] 6. Test + implement `resumeFromSnapshot` (interrupted Devs restart with the same attempt; run finishes) — `executor.ts`, `active_run.ts`, `executor.test.ts`
- [ ] 7. Test + implement `recoverRuns` report: resumed, interrupted, still paused, failed, closed workspaces — `recovery.ts`, `recovery.test.ts`
- [ ] 8. Test: paused run with future `resumeAt` stays paused and resumes on time; no NodeRun runs twice at once — `recovery.test.ts`
- [ ] 9. Recovery log line + call `recoverRuns` at boot before listening — `recovery.ts`, `main.ts`
- [ ] 10. Self-review checklist and feedback loops
