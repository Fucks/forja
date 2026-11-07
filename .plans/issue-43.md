# Issue #43: Scheduler de DAG por item com concorrência global

## Decisions

- Contracts from the issue live in `src/engine/scheduler_types.ts` verbatim; `SchedulerSnapshot` is
  JSON-safe (dates as ISO strings) — conversion in `src/engine/scheduler_snapshot.ts`.
- `src/engine/scheduler.ts` holds `createScheduler` + a `DagScheduler` class (private mutable state, no
  argument mutation). Pure helpers split out to keep files small:
  `src/engine/node_scopes.ts` (which nodes run per item) and `src/engine/node_inputs.ts` (resolve inputs →
  waiting | skip | ready).
- Node scope (`node_scopes.ts`): a node runs per item when an incoming edge splits a list into items
  (`workItemList` output → `workItem` input) or comes from a per-item node; otherwise it runs once.
  No gather of per-item outputs outside groups (that shape only exists via map, #44).
- Fan-out: the first `workItemList` output that flows into a per-item node defines the run's items; all
  per-item NodeRuns are created PENDING at that moment. The value fed to a `workItem` port is that list
  element.
- Readiness: a NodeRun waits until every upstream NodeRun (same item) is terminal. It is SKIPPED when any
  connected edge brings no value (upstream skipped/failed or unchosen condition port = port missing from
  `outputs`), so skips cascade. Merge nodes after a condition are not supported outside groups.
  Otherwise QUEUED; inputs are resolved again at start.
- Extra helper files: `flow_plan.ts`, `node_run_registry.ts`, `agent_start_pacer.ts`,
  `scheduler_queue.ts`, `src/test/factories/scheduler_flows.ts`.
- Only `agent`/`script` count for the ceiling and the start interval; other nodes start right away.
  `trigger` succeeds on `start` with `outputs.items = items` without a start command.
- A `node_run_failed` outside a cancel makes the run stop: PENDING/QUEUED → CANCELED, RUNNING finish, then
  run FAILED. `kind: "canceled"` → NodeRun CANCELED; otherwise FAILED.
- `FakeAgentRuntime` doesn't exist yet (owned by another issue): the harness uses scripted per-node
  behaviors (duration + outputs/failure) on top of `FakeClock`.

## Tasks

- [x] 1. Contract types in `src/engine/scheduler_types.ts`
- [x] 2. Harness `src/test/factories/scheduler_harness.ts` (scripted executor + timeline) and small graph builders
- [x] 3. Test + impl: linear trigger → A → B with 2 items; B of item 1 starts when A of item 1 ends; run SUCCEEDED — `scheduler.test.ts`, `scheduler.ts`, `node_scopes.ts`, `node_inputs.ts`
- [x] 4. Test + impl: `maxConcurrentAgents: 2` with 5 items never exceeds 2 RUNNING agents
- [x] 5. Test + impl: `minStartIntervalMs: 5000` spaces agent starts ≥ 5 s (schedule_wakeup + tick)
- [x] 6. Test + impl: FIFO order by queuedAt, topological order, item id
- [x] 7. Test + impl: condition false → nodes of the true branch for that item SKIPPED
- [x] 8. Test + impl: a node receiving the list (source) runs once and fans its list out per item
- [x] 9. Test + impl: agent failure → run FAILED after the other RUNNING finish; queue canceled
- [x] 10. Test + impl: cancel_requested cancels the queue, asks cancel of RUNNING, run CANCELED on confirm
- [x] 11. Test + impl: `restore` from a JSON-safe `snapshot()` continues where it stopped — `scheduler_snapshot.ts`
- [ ] 12. Refactor pass, self-review checklist (section 5) and feedback loops (section 6)
