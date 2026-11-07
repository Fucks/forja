# Issue #45: Executar grupo loop com condição de saída e teto

## Decisions

- Pure loop rules live in `src/engine/loop_group.ts` (contract names: `LoopInstanceState`, `startLoop`,
  `iterationData`, `decideAfterIteration`); plus `failLoop`/`cancelLoop` helpers there.
- `nodeSlug(label)` in `src/shared/node_slug.ts`: trim, lowercase, strip accents (NFD), whitespace → `_`.
- Condition paths start with the node slug. `buildLoopFlow` until becomes `revisar.approved`, and the
  loop-condition validation knows slugs (not ids) + output port names, so editor and engine agree.
- Scheduler wiring mirrors maps: `src/engine/loop_group_coordinator.ts` (new, keeps scheduler.ts small)
  holds one `LoopInstanceState` per (loop, item), settles iterations and creates the next iteration's
  NodeRuns. Snapshot gains `loopInstances`.
- Loop membership = innermost loop of the node (nested loops not handled). Loop NodeRuns get
  `iteration = n` (1-based); others stay 0.
- `NodeRunRegistry.find(nodeId, item)` returns the NodeRun with the highest iteration.
- Input resolution: back edges of a loop are ignored; carry values are merged into the inputs of every
  node inside the loop (matches `availablePaths` in prompt_template); an edge leaving a loop waits until
  the loop instance finishes and only delivers when it `succeeded`.
- `exhausted` port: edge `from: { nodeId: <loopGroupId>, port: "exhausted" }` (`LOOP_EXHAUSTED_PORT` in
  `flow_graph.ts`); it is a `workItem` port delivering the loop's work item; validation resolves it as a
  virtual source port.
- Scheduler tests use the existing `SchedulerHarness` scripts (keyed by node, reading
  `nodeRun.iteration`) — same style as the map tests.

## Tasks

- [x] 1. Test + implement `nodeSlug` — `src/shared/node_slug.ts`, `src/shared/node_slug.test.ts`
- [x] 2. Test + implement `startLoop` and `iterationData` — `src/engine/loop_group.ts`, `loop_group.test.ts`
- [x] 3. Test + implement `decideAfterIteration` (exit, repeat with carry, exhausted) — `loop_group.ts`
- [x] 4. Condition paths by slug: `buildLoopFlow` until `revisar.approved`, loop validation knows slugs — `flow_graph_factory.ts`, `loop_rules.ts`, tests
- [x] 5. `exhausted` port: `LOOP_EXHAUSTED_PORT`, FlowEdge comment, validation virtual port — `flow_graph.ts`, `graph_lookups.ts`, `graph_validation.test.ts`
- [ ] 6. Test (scheduler): approval on iteration 2 ends the loop with 2 iterations and goes to the PR — scheduler flow factory + loop coordinator + registry + inputs
- [ ] 7. Test (scheduler): never approved with cap 3 → 3 iterations, item leaves through `exhausted`, PR skipped
- [ ] 8. Test (scheduler): `inputs.notes` of iteration 2 holds the Reviewer notes of iteration 1
- [ ] 9. Test (scheduler): loop inside a map with 2 items keeps independent iterations per item
- [ ] 10. Test (scheduler): unrecoverable failure inside the loop fails the item
- [ ] 11. Test (scheduler): loop state survives snapshot/restore; cancel ends loop instances
- [ ] 12. Self-review checklist and feedback loops (typecheck, lint, test)
