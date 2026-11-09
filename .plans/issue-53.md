# Issue #53: API de runs: iniciar, pausar, retomar, cancelar e repetir

## Decisions

- `src/shared/run_types.ts`: Zod inputs at the boundary (`startRunInput` exactly as the contract,
  `listRunsQuery`, `raiseRunBudgetInput`) and the wire shapes with ISO dates (`SerializedRunRecord`,
  `SerializedNodeRun`, `SerializedRunView`) built with `JsonDates` from the engine.
- `RunView` / `buildRunView` live in `src/server/runs/run_view.ts` with the domain types of the contract
  (`RunRecord` from `run_repository.ts`, `NodeRunState` from the engine). Group progress reuses the
  engine's `MapProgress` shape and is computed only for map groups from the latest NodeRun of each node
  per item (insertion order): running > failed > succeeded (every node directly in the map succeeded or
  was skipped) > queued.
- `RunService` (`run_service.ts`) sits over `Executor` + `RunRepository` + `FlowService` + `EventBus`.
  It checks the run/NodeRun status first and throws `ConflictError` (409) for invalid transitions, so
  the executor's "not in progress" 404 is never what a terminal run answers.
    - pause: RUNNING or PAUSED; resume: PAUSED by the user; cancel / raise budget: not terminal;
      cancel NodeRun: neither run nor NodeRun terminal; retry: `canRetryOnRequest` from the engine.
- Executor changes (outside the issue's file list, minimal):
    - message "Publique o fluxo antes de executar." for a flow without a published version (422);
    - `retryNodeRun` restores a finished run from its snapshot before delivering the retry, so the run
      reopens (finished runs are no longer in memory);
    - new `raiseRunBudget(runId, runLimit)` delivering `budget_raised` with the project's daily budget kept.
- `EventBus.lastEventId()` added for `RunView.lastEventId`.
- Actions answer 204; `POST /projects/:projectId/runs` answers 201 with the `RunRecord`.
- Route tests build the app with `createTestAppDeps` via `ExecutorTestBed.buildAppDeps()` (its executor, events and a
  `FakeClock` the test controls).

## Tasks

- [x] 1. Shared run types and inputs — `src/shared/run_types.ts`
- [x] 2. Test + implement `buildRunView` (run, nodeRuns, graph, lastEventId, map progress) — `src/server/runs/run_view.ts`, `run_view.test.ts`
- [x] 3. `EventBus.lastEventId()` — `src/server/runtime/event_bus.ts` (+ test)
- [x] 4. Test + implement `RunService.startRun` / `listRuns` (422 message) — `run_service.ts`, `run_service.test.ts`, `executor.ts`
- [x] 5. Test + implement pause / resume / cancel with 409 on invalid transitions — `run_service.ts`
- [x] 6. Test + implement `getRunView` (graph of the run's version, not the draft) — `run_service.ts`
- [x] 7. Test + implement cancel / retry NodeRun; retry reopens a finished run — `run_service.ts`, `executor.ts`
- [x] 8. Test + implement raise budget (`budget_raised`) — `run_service.ts`, `executor.ts`
- [x] 9. Test + implement `getNodeRun` with artifacts — `run_service.ts`
- [x] 10. Routes and route tests (status codes, pagination, RunView shape) — `runs_routes.ts`, `runs_routes.test.ts`
- [x] 11. Self-review checklist and feedback loops
