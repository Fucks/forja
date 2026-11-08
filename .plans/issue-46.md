# Issue #46: Retentativas, timeouts e cancelamento de NodeRuns

## Decisions

- `src/engine/retry_policy.ts` holds only the pure policy (`FailureKind`, `RetryDecision`, `decideRetry`)
  exactly as in the issue contract. Delay = min(30 s × 2^(attempt-1), 10 min); `workspace` retries while
  `attempt <= 2` with 2 min delay; `canceled`/`budget` never; `usage_limit`/`interrupted` never and
  `countsAsAttempt: false`.
- `FlowPlan` answers the node questions: `maxRetriesOf(nodeId)` (agent `config.retries`, 0 otherwise) and
  `timeoutMsOf(nodeId)` (agent/script `config.timeoutMinutes`, undefined otherwise).
- A `node_run_failed` without error counts as `runtime`.
- Retry: failed NodeRun stays FAILED; a new NodeRun (same node/item/iteration, `attempt + 1`) is born
  QUEUED with `queuedAt = at + delayMs`; the scheduler emits one `schedule_wakeup` at `queuedAt` and only
  starts QUEUED NodeRuns whose `queuedAt <= now`. A retried failure does not stop the run nor fail the item.
- Timeout total: starting an agent/script emits `schedule_wakeup` at `startedAt + timeout`; `advance`
  cancels RUNNING NodeRuns past their deadline once, remembering them in `timedOutNodeRunIds` (persisted
  in the snapshot); their `canceled` confirmation is recorded as `timeout_total` and goes through the policy.
- Default agent `retries` is 1, so existing scheduler tests that fail for good use a `withoutRetries`
  flow helper in `src/test/factories/scheduler_flows.ts`.
- `cancel_node_run_requested`: RUNNING → `cancel_node_run`; other non-terminal → CANCELED; terminal →
  ignored. Outside a map it cancels the whole run. A map item finished as failed while the run is not
  stopping is recorded in `run.failedItems` (covers a canceled NodeRun).
- `retry_node_run_requested`: only for the latest NodeRun of its node/item; run RUNNING (not stopping) with
  the NodeRun FAILED/CANCELED, or run FAILED/SUCCEEDED (reopened to RUNNING, `stopOutcome` cleared,
  `finishedAt`/`error` cleared by `transitionRun`). New NodeRun `attempt + 1` PENDING; downstream nodes of
  the same item whose latest NodeRun is SKIPPED/FAILED/CANCELED get a new PENDING NodeRun (`attempt + 1`);
  CANCELED included because a failed run cancels its pending NodeRuns. The map item goes back to
  `running` (`reopenItem` in `map_group.ts`) and leaves `run.failedItems`.
- Out of scope: reopening a finished loop instance on manual retry.

## Tasks

- [x] 1. Test + implement `decideRetry` matrix — `src/engine/retry_policy.ts`, `retry_policy.test.ts`
- [x] 2. Test + implement run reopening transitions FAILED/SUCCEEDED → RUNNING clearing finishedAt/error — `src/engine/run_state.ts`, `run_state.test.ts`
- [x] 3. Add `withoutRetries` to flows used by failing-for-good scheduler tests — `src/test/factories/scheduler_flows.ts`, `scheduler.test.ts`
- [x] 4. Test + implement automatic retry with delay (structured_output, retries 1 → 2 NodeRuns, 30 s apart) — `scheduler.ts`, `flow_plan.ts`, `scheduler.test.ts`
- [x] 5. Test + implement `workspace` retried after 2 min up to 2 times with retries 0 — `scheduler.test.ts`
- [x] 6. Test + implement total timeout cancel recorded as `timeout_total` — `scheduler.ts`, `scheduler_types.ts`, `scheduler_snapshot.ts`, `scheduler.test.ts`
- [x] 7. Test + implement `cancel_node_run_requested` (map item fails alone; outside groups cancels the run; QUEUED → CANCELED) — `scheduler_types.ts`, `scheduler.ts`, harness, `scheduler.test.ts`
- [x] 8. Test + implement `retry_node_run_requested` reopening a finished run for one item — `scheduler.ts`, `map_group.ts`, `map_group_coordinator.ts`, `scheduler.test.ts`
- [x] 9. Test + implement `retry_node_run_requested` on a running run (failed NodeRun) and ignored cases — `scheduler.test.ts`
- [ ] 10. Refactor pass on scheduler readability/size
- [ ] 11. Self-review checklist (section 5) and feedback loops (section 6)
