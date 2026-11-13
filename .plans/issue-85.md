# Issue #85: Desempenho do canvas, dos logs e do motor

## Decisions

- Perf tests are `*.perf.test.ts(x)`, excluded from `vitest.config.ts` and run only by
  `vitest.perf.config.ts` (`npm run test:perf`), keeping the `server` (node) and `web` (jsdom) projects.
- Each target is the issue's number times `CI_SLACK_FACTOR = 2`, written as `TARGET_MS * CI_SLACK_FACTOR`.
- `buildLargeFlow({ nodes, groups })`: one trigger plus `nodes - 1` agents split across `groups` map
  groups; each group is a chain fed by the trigger. Reuses `connect`/`createNodeOfType`.
- Render counting: the canvas perf test wraps `useNodeLiveState` (module `node_live_context.ts`) with
  `vi.mock` and counts calls per node id — every render of a node card/group reads it once.
- Live states go from a Map-valued context (every node re-renders on any change) to a
  `NodeLiveStore` in the same `NodeLiveContext`, read per id with `useSyncExternalStore`; it notifies
  only the ids whose state changed.
- Scheduler: the `SchedulerHarness` is the engine's in-memory runtime (FakeAgentRuntime lives in the
  server executor); it records how long each `scheduler.handle` call takes (`handleDurationsMs`).

## Tasks

- [x] 1. `buildLargeFlow` factory — `src/test/factories/large_flow_factory.ts`
- [x] 2. Perf config and `test:perf` script; exclude perf tests from `npm run test` — `vitest.perf.config.ts`, `vitest.config.ts`, `package.json`
- [x] 3. Test: canvas mounts 150 nodes within the target — `src/web/canvas/canvas.perf.test.tsx`
- [x] 4. Test (RED): 500 `node_run.updated` events re-render only the affected nodes — `src/web/canvas/canvas.perf.test.tsx`
- [x] 5. Make live states a per-node subscribable store so the test passes — `node_live_context.ts`, `run_canvas.tsx`, `nodes.test.tsx`
- [ ] 6. Test: LogViewer mounts 100k lines and appends 1 000 within the targets (optimize if needed) — `src/web/logs/log_viewer.perf.test.tsx`
- [ ] 7. Record handle durations in the harness — `src/test/factories/scheduler_harness.ts`
- [ ] 8. Test: scheduler 100 items × 5 nodes averages under the handle target (optimize if needed) — `src/engine/scheduler.perf.test.ts`
- [ ] 9. Self-review checklist and feedback loops (typecheck, lint, test, test:perf)
