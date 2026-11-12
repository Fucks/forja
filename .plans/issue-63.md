# Issue #63: Execução ao vivo no canvas

## Decisions

- The web receives the run view as JSON, so the contract's `RunView` is `SerializedRunView` from
  `src/shared/run_types.ts` (dates as ISO strings). The view model signatures take `SerializedRunView`.
- Map progress per item reuses the server rule: `progressOfMaps` moves from `src/server/runs/run_view.ts`
  to `src/engine/map_progress.ts` (pure) and is used by both `buildRunView` and the view model when a
  filter is set. Without a filter the group counters come from `view.groups` (kept current by
  `group.progress` events).
- Item filter keeps NodeRuns without `workItemId` (they belong to every item) and drops other items'.
- Node status follows the contract; terminal states with no success use the last NodeRun's own status
  (FAILED / CANCELED). Every graph node gets an entry (PENDING when it never ran).
- Badge: items whose latest NodeRun of the node is RUNNING — one: `item #<workItemId>`, many: `N itens`.
- `applyEvent` ignores envelopes with `id <= view.lastEventId` and advances `lastEventId`; run events take
  `startedAt`/`finishedAt` from `envelope.at`.
- `useLiveRun(runId, createEventSource?)` follows `useBoard`'s optional event source for tests. A new
  `EventSource` cannot send `Last-Event-ID`, so every (re)connection reloads the view; events received while
  a load is in flight are replayed over the loaded view (idempotent thanks to the id check).
- `FlowCanvas` props become a union: editable `{ store, issuesByTarget }` or `{ readOnly: true, store,
  flowingEdgeIds }`. The read-only branch renders React Flow without drag, connect, delete, drop, toolbar,
  menus or shortcuts. `RunCanvas` keeps its own editor store loaded with the run's graph.
- Run actions live in `src/web/canvas/live/use_run_actions.ts` (mutations, invalidate the run query) and the
  bar is split into `run_control_bar.tsx`, `run_actions.tsx` and `run_item_select.tsx`.

## Tasks

- [x] 1. Refactor: move map progress to `src/engine/map_progress.ts`, `run_view.ts` uses it
- [x] 2. Test+impl: node status and counters per node — `run_view_model.ts`
- [x] 3. Test+impl: badge with current items and group progress from the view — `run_view_model.ts`
- [x] 4. Test+impl: filter by item (node states and map progress) — `run_view_model.ts`
- [ ] 5. Test+impl: `applyEvent` for node_run.updated, group.progress, run.* — `run_view_model.ts`
- [ ] 6. Test+impl: `flowingEdges` — `run_view_model.ts`
- [ ] 7. Test+impl: `useLiveRun` loads the view and applies events — `use_live_run.ts`
- [ ] 8. Test+impl: `useLiveRun` reloads on reconnection and replays events during the load
- [ ] 9. Impl: `FlowCanvas` read-only mode — `flow_canvas.tsx` (+ test in `flow_canvas.test.tsx`)
- [ ] 10. Test+impl: `RunCanvas` renders node states, group counters, flowing edges — `run_canvas.tsx`
- [ ] 11. Test+impl: run actions (pause/resume/cancel with confirmation, raise budget) —
      `use_run_actions.ts`, `run_actions.tsx`, `run_control_bar.test.tsx`
- [ ] 12. Test+impl: control bar summary (status, flow · version, duration, pause reason with resume time)
      — `run_control_bar.tsx`
- [ ] 13. Impl: item selector and `RunPage` wiring — `run_item_select.tsx`, `run_page.tsx`
- [ ] 14. Self-review checklist and feedback loops
