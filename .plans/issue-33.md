# Issue #33: Conectar portas com validação de tipo

## Decisions

- `checkConnection` evaluates the graph *as it would be after* `connect` (the edge already on the input
  is replaced), so replacing an edge never counts as a cycle by itself.
- Check order: self-connection → output→output → types → cycle outside loop.
- Type rule reuses the server: `isConnectionCompatible` from `src/engine/validation_rules/port_rules.ts`
  is exported (no copy), ports resolved with `findSourcePort`/`findTargetPort` (handles loop `exhausted`).
- Cycle rule: `topologicalOrder` (graph_queries) throwing `CycleOutsideLoopError` on the candidate graph
  but not on the current one. Pre-existing cycles are left to the validation of #37.
- `PortRef` is declared in `edge_actions.ts` as `FlowEdge["from"]`.
- Edge ids come from `newId("edg")` — add `"edg"` to `IdPrefix` in `src/lib/ids.ts`.
- Group RF nodes get `deletable: false` (ungrouping is another issue), so Delete never removes a group
  or, through React Flow, its children.
- Drag feedback: `PortHandle` reads a context (`ConnectionCheckContext`) + `useConnection` to add
  `port-handle--compatible` / `port-handle--incompatible`; CSS in `canvas_theme.css`.

## Tasks

- [x] 1. Test+impl: compatible ports (`summary` text → `context` text) are accepted — `connection_rules.ts`
- [x] 2. Test+impl: incompatible types rejected with "Tipos incompatíveis: text → workItemList"
- [x] 3. Test+impl: self-connection rejected
- [x] 4. Test+impl: output → output rejected
- [x] 5. Test+impl: cycle outside loop rejected; cycle inside loop accepted
- [x] 6. Test+impl: `connect` adds the edge and replaces the one already on the input — `edge_actions.ts`
- [x] 7. Test+impl: `removeEdges` and `removeNodes` (cascade to connected edges)
- [x] 8. Canvas: `onConnect`, `isValidConnection`, `onEdgesDelete`, `onNodesDelete`, Delete/Backspace — `flow_canvas.tsx`
- [x] 9. Canvas: compatible/incompatible port highlight during drag — `port_handle.tsx`, css
- [x] 10. Canvas: tooltip with the reason for 3 s when dropped on an incompatible port
- [x] 11. Selected edge 2 px `--color-accent`
- [ ] 12. Self-review checklist and feedback loops
