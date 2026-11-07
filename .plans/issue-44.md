# Issue #44: Executar grupo map com concorrência configurável

## Decisions

- `src/engine/map_group.ts` holds the contract's pure functions plus two extras the scheduler needs:
  `startItems(state, itemIds)` (marks admitted items `running`) and `succeededItemIds(state)` (map output,
  input order). `onItemFinished` with `failFast` turns `queued` items into `canceled`.
- An item enters a map's subgraph lazily: the scheduler creates the PENDING NodeRuns of the map's member
  nodes for an item only when `itemsToStart` admits it. Item nodes outside maps keep the #43 behavior.
- Item outcome in a map: `failed` when any of its NodeRuns in the map is FAILED or CANCELED, else `succeeded`.
- Map input: list-fed maps receive the run's item list (`addItems` + `closeInput`); maps with entering edges
  for which `isItemCorrelatedEdge` holds are fed by their upstream maps (an item is added when it succeeded
  in every upstream map; input closes when every upstream map is done). With `barrier: true` upstream, items
  are only released when the upstream map is done.
- Nodes inside a map are always `item` scope. An edge leaving a map into a `workItemList` port collects the
  map's output (one value per succeeded item, input order) and does not make the target item scope; an empty
  output skips the target.
- Failure inside a map does not stop the run; failed items go to `RunState.failedItems`. `failFast` stops the
  run (FAILED) and cancels the running NodeRuns of the map. Failures outside maps keep the #43 behavior.
- `group_progress` is emitted on every map state change. Map states are part of the snapshot.
- Touched beyond the issue's list (minimal): `run_state.ts` (failedItems), `flow_plan.ts`, `node_scopes.ts`,
  `node_inputs.ts`, `scheduler_types.ts`, `scheduler_snapshot.ts`, test factories/harness.

## Tasks

- [ ] 1. Test + implement map_group state: create, addItems, closeInput, itemsToStart, startItems — `map_group.ts`
- [ ] 2. Test + implement onItemFinished (incl. failFast), isMapDone, mapProgress, succeededItemIds, empty list — `map_group.ts`
- [ ] 3. Plan map topology and item scope of map members — `flow_plan.ts`, `node_scopes.ts`
- [ ] 4. Test: canonical flow, Dev map never runs more than 3 items, the rest start as slots open — `scheduler.test.ts`; implement lazy admission in `scheduler.ts`
- [ ] 5. Test: chained maps stream per item, Reviewer one at a time, Dev gets the TL spec of the same item; implement correlation
- [ ] 6. Test: global ceiling 2 with concurrency 3 runs at most 2 agents
- [ ] 7. Test: map output list keeps input order; implement list collection in `node_inputs.ts`
- [ ] 8. Test: barrier holds everything downstream until the map is done; implement
- [ ] 9. Test: a failed item does not stop the others, does not reach the next map, run SUCCEEDED with failedItems; implement
- [ ] 10. Test: failFast cancels the queue and the running items; implement
- [ ] 11. Test: empty list concludes the maps and skips the list consumer
- [ ] 12. Test: group_progress emitted per change; map states survive snapshot/restore
- [ ] 13. Self-review checklist and feedback loops (typecheck, lint, test)
