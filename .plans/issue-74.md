# Issue #74: Gatilhos: modelo, políticas e disparo manual

## Decisions

- `TRIGGER_KINDS` moves to `src/shared/trigger_types.ts`; `node_configs/trigger_config.ts` imports it from there.
- `trigger_types.ts` also holds the Zod schemas of the route inputs (`createTriggerInput`, `updateTriggerInput`,
  `listTriggersQuery`, `fireTriggerInput`, `triggersPausedInput`), types derived with `z.infer` where possible.
- Global pause lives in `app_meta` (key `triggers.paused`), read/written by `TriggerRepository`.
- `trigger_fires` stores, besides the `TriggerFire` fields, `reason` and `item_ids_json`, so a queued fire
  can start later with the same items. A queued fire is updated in place to `started` (or `error`) when
  it leaves the queue.
- Active runs of a flow = `RunRepository.listActiveRuns()` filtered by `flowId` (the run is saved before
  `run.finished` is published).
- Run items: `itemSelection: "event_items"` passes `input.itemIds ?? []`; `"source"` starts with no items
  (the flow's source node finds them).
- `createTriggerService(deps)` returns the contract `TriggerService`; `startQueuedFiresWhenRunsFinish(deps)`
  (same file) subscribes to `run.finished`, starts queued fires of idle flows right away and returns the
  unsubscribe. Work per flow goes through `SerialQueueByKey`. The routes start it on `onReady`, stop on `onClose`.
- Service deps: `{ repo, executor: Pick<Executor,"startRun">, runs: Pick<RunRepository,"listActiveRuns">, events, clock }`.
  Tests use `FakeRunStarter` (`src/test/fakes/fake_run_starter.ts`) over `InMemoryRunRepository`.
- A failure to start a run records an `error` fire; domain errors keep their message, others a generic one.

## Tasks

- [x] 1. `decidePolicy` pure with tests — `src/server/triggers/concurrency_policy.ts`, `concurrency_policy.test.ts`
- [x] 2. Trigger types and input schemas — `src/shared/trigger_types.ts`, `src/shared/node_configs/trigger_config.ts`
- [x] 3. Migration and Drizzle schema — `src/server/db/migrations/0800_triggers.sql`, `src/server/db/schema/triggers.ts`
- [x] 4. Repository for triggers, fires and the pause flag — `src/server/triggers/trigger_repository.ts`
- [x] 5. Service CRUD (create validates project and flow, update, remove, list by kind) with tests and `FakeRunStarter` — `trigger_service.ts`, `trigger_service.test.ts`, `src/test/fakes/fake_run_starter.ts`
- [ ] 6. `fire` of a manual trigger starts a run with `triggerId`, publishes `trigger.fired`, shows in `history`
- [ ] 7. `fire` of a disabled trigger or under global pause records `skipped` (except manual); `setAllPaused`/`isAllPaused`
- [ ] 8. Policy `skip` records `skipped` with an active run; `parallel` starts another run
- [ ] 9. Policy `queue` records `queued`; the queued fire starts when the active run finishes
- [ ] 10. Queued fires of idle flows start when the listener starts (server restart)
- [ ] 11. A failure to start the run records an `error` fire
- [ ] 12. Routes with tests — `src/server/triggers/triggers_routes.ts`, `triggers_routes.test.ts`
- [ ] 13. Self-review checklist (section 5) and feedback loops (section 6)
