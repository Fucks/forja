# Issue #25: Validação do grafo do fluxo

## Decisions

- New code lives in `src/engine/` (pure, no I/O). Tests use `buildCanonicalFlow`/`buildLoopFlow` from
  `src/test/factories/flow_graph_factory.ts` plus small broken variations built in the test files.
- `graph_queries.ts` exports exactly the contract functions plus `isItemCorrelatedEdge` and
  `CycleOutsideLoopError` (thrown by `topologicalOrder`).
- Membership: `groupMembers` is direct only; "inside a group" elsewhere means the group is in
  `enclosingGroups(node)` (which stops on missing parents and on parent cycles).
- Back edge of a loop = DFS back edge over the loop's internal edges (both ends inside the loop), DFS starting
  from entry nodes (targets of entering edges) sorted by id, then remaining members by id. Maps have no back
  edges (`back: []`).
- `areTypesCompatible` is type-only: `any` on either side → true; same type → true; everything else false
  (including `workItemList → workItem`). The validation adds the map exception: list → item is valid when a
  map enclosing the target does not enclose the source.
- `required_input_unconnected` skips required `workItem` inputs of nodes inside a map.
- `cycle_outside_loop`: every strongly connected component with a cycle must be inside a single loop group;
  one issue per component, target = node with the smallest id.
- `map_many_list_inputs`: more than one entering `workItemList` edge, or list edge + correlated edges.
- `loop_condition_unknown_port`: first path segment must be the id of a node inside the loop or an output port
  name of one of those nodes.
- `many_triggers`: one issue per trigger node. `duplicate_id`: one issue per repeated occurrence (2nd onward).
- Dangling edges are reported once and ignored by the other edge rules.
- `AgentNode = NodeOfType<"agent">` is exported from `graph_validation.ts` (contract of `ValidationContext`).
- Rules are split by concern into `src/engine/validation_rules/*.ts` to keep files short;
  `graph_validation.ts` concatenates them and sorts errors first (stable).

## Tasks

- [x] 1. Queries: `incomingEdges`, `outgoingEdges`, `groupMembers` — `src/engine/graph_queries.ts` + test
- [x] 2. Queries: `enclosingGroups` (inner → outer, robust to missing/cyclic parents) + test
- [x] 3. Queries: `groupBoundaryEdges` entering/leaving/back + test
- [x] 4. Queries: `topologicalOrder` (deterministic, ignores loop back edges, throws on cycle) + test
- [x] 5. Queries: `areTypesCompatible` and `isItemCorrelatedEdge` + test
- [x] 6. Validation: canonical and loop flows have no errors; `duplicate_id`, `no_trigger`, `many_triggers`
- [x] 7. Validation: `dangling_edge`, `group_overlap`
- [x] 8. Validation: `required_input_unconnected` (with map item exemption), `incompatible_ports`
- [x] 9. Validation: `cycle_outside_loop` (accepted inside loop), `loop_without_back_edge`
- [x] 10. Validation: `map_without_list_input`, `map_many_list_inputs`
- [x] 11. Validation: `loop_condition_unknown_port`
- [x] 12. Validation: `empty_prompt`, `unknown_tool_profile`, `unknown_credential`, `checkPrompt` injection
- [x] 13. Validation: issues are sorted with errors first
- [ ] 14. Self-review checklist and feedback loops (typecheck, lint, test)
