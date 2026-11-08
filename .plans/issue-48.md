# Issue #48: Pausa e retomada automática por limite de uso

## Decisions

- `computeResumeAt` lives in `src/engine/usage_pause.ts` (pure); `fallbackMinutes` defaults to 30.
  The same file holds the pure `requeueAfterUsageLimit(nodeRun, at)`: WAITING_LIMIT → QUEUED with the same
  id and `attempt`, clearing `startedAt` (the timeout counts from the new start) and the `usage_limit` error.
- `node_run_failed` gains an optional `resetAt?: Date` (from `UsageLimitError.resetAt`); `NodeRunError`
  stays as is.
- `SchedulerOptions.usageLimitMarginMinutes: number` is required; the harness passes 5 by default.
- The scheduler only resumes on `tick` while the run is `PAUSED` with `pauseReason: "usage_limit"`, so a
  user pause (event added by #51) keeps the run paused. Tested by restoring a snapshot with
  `pauseReason: "user"`.
- A second limit while already paused by the limit: no new `usage_limit_reached`; the later `resumeAt` wins
  (run_changed + schedule_wakeup only when it moves later).
- A limit while paused by the budget takes the pause over (the budget is checked again before each agent
  starts, so nothing is lost).
- `stop()` also cancels WAITING_LIMIT NodeRuns so a failing/canceled run can still finish.
- A usage limit while the run is stopping is recorded as a plain failure (no pause).
- Harness gets a `{ kind: "hit_usage_limit"; resetAt?: Date }` outcome.

## Tasks

- [x] 1. Test + implement `computeResumeAt` (future resetAt + margin, past resetAt, missing resetAt, custom fallback) — `src/engine/usage_pause.ts`, `src/engine/usage_pause.test.ts`
- [x] 2. Contracts: `usageLimitMarginMinutes`, `usage_limit_reached`/`usage_limit_reset` commands, `resetAt` on `node_run_failed` — `src/engine/scheduler_types.ts`, harness, scheduler.test options
- [x] 3. Harness outcome `hit_usage_limit` — `src/test/factories/scheduler_harness.ts`
- [x] 4. Test + implement: limit with resetAt 15:00, margin 5 → NodeRun WAITING_LIMIT, run PAUSED usage_limit resumeAt 15:05, `usage_limit_reached`, wakeup — `scheduler.ts`, `scheduler.test.ts`
- [x] 5. Test: without resetAt the run resumes 30 min later — `scheduler.test.ts`
- [x] 6. Test: map of 3 Devs, 2nd hits the limit; nothing starts during the pause, the running ones finish — `scheduler.test.ts`
- [x] 7. Test + implement: tick at resumeAt → `usage_limit_reset`, WAITING_LIMIT → QUEUED same attempt, run RUNNING, flow completes — `usage_pause.ts`, `scheduler.ts`, tests
- [x] 8. Test: hitting the limit does not consume retries (retries 0 still succeeds after the reset) — `scheduler.test.ts`
- [x] 9. Test + implement: a second limit during the pause → WAITING_LIMIT, no new pause command, later resumeAt wins — `scheduler.ts`, test
- [x] 10. Test + implement: run paused by the user keeps PAUSED/user at resumeAt — `scheduler.ts`, test
- [x] 11. Test + implement: a run that fails during the limit pause cancels its WAITING_LIMIT NodeRuns and finishes after the reset — `scheduler.ts`, test
- [ ] 12. Test + implement: a limit while paused by the budget takes the pause over — `scheduler.ts`, test
- [ ] 13. Self-review checklist (section 5) and feedback loops (section 6)
