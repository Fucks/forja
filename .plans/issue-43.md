# Issue #43: Scheduler de DAG por item com concorrência global

## Decisions

- Contracts from the issue live in `src/engine/scheduler_types.ts` verbatim; `SchedulerSnapshot` is
  JSON-safe (dates as ISO strings) — conversion in `src/engine/scheduler_snapshot.ts`.
- `src/engine/scheduler.ts` holds `createScheduler` + a `DagScheduler` class (private mutable state, no
  argument mutation). Pure helpers split out to keep files small:
  `src/engine/node_scopes.ts` (which nodes run per item) and `src/engine/node_inputs.ts` (resolve inputs →
  waiting | skip | ready).
- Node scope: a node runs per item when an incoming edge targets a `workItem` input or comes from a per-item
  node, unless it has a connected `workItemList` input (then it runs once and gathers the per-item outputs
  as a list, in item order).
- Fan-out: the first `workItemList` output that flows into a per-item node defines the run's items; all
  per-item NodeRuns are created PENDING at that moment. The value fed to a `workItem` port is that list
  element.
- Readiness: a NodeRun waits until every upstream NodeRun (same item) is terminal. It is SKIPPED when a
  required input has no value, or when none of its incoming edges carries a value (unchosen condition
  port = port missing from `outputs`). Otherwise QUEUED with the resolved inputs.
- Only `agent`/`script` count for the ceiling and the start interval; other nodes start right away.
  `trigger` succeeds on `start` with `outputs.items = items` without a start command.
- A `node_run_failed` outside a cancel makes the run stop: PENDING/QUEUED → CANCELED, RUNNING finish, then
  run FAILED. `kind: "canceled"` → NodeRun CANCELED; otherwise FAILED.
- `FakeAgentRuntime` doesn't exist yet (owned by another issue): the harness uses scripted per-node
  behaviors (duration + outputs/failure) on top of `FakeClock`.

## Tasks

- [ ] 1. Contract types in `src/engine/scheduler_types.ts`
- [ ] 2. Harness `src/test/factories/scheduler_harness.ts` (scripted executor + timeline) and small graph builders
- [ ] 3. Test + impl: linear trigger → A → B with 2 items; B of item 1 starts when A of item 1 ends; run SUCCEEDED — `scheduler.test.ts`, `scheduler.ts`, `node_scopes.ts`, `node_inputs.ts`
- [ ] 4. Test + impl: `maxConcurrentAgents: 2` with 5 items never exceeds 2 RUNNING agents
- [ ] 5. Test + impl: `minStartIntervalMs: 5000` spaces agent starts ≥ 5 s (schedule_wakeup + tick)
- [ ] 6. Test + impl: FIFO order by queuedAt, topological order, item id
- [ ] 7. Test + impl: condition false → nodes of the true branch for that item SKIPPED
- [ ] 8. Test + impl: list-receiving node runs once with the gathered outputs
- [ ] 9. Test + impl: agent failure → run FAILED after the other RUNNING finish; queue canceled
- [ ] 10. Test + impl: cancel_requested cancels the queue, asks cancel of RUNNING, run CANCELED on confirm
- [ ] 11. Test + impl: `restore` from a JSON-safe `snapshot()` continues where it stopped — `scheduler_snapshot.ts`
- [ ] 12. Refactor pass, self-review checklist (section 5) and feedback loops (section 6)
