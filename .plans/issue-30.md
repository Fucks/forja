# Issue #30: Canvas do editor carregando e salvando o rascunho

## Decisions

- `graph_mapping.ts`: a flow node becomes an RF node whose `type` is the `NodeType` (data
  `{ flowNode }`; #31 only has to register per-type components) and a group an RF node of type
  `"group"` (data `{ flowGroup }`, fixed `width`/`height` from `group.size`). Groups come first, parents before
  children. `fromReactFlow` keeps the previous graph's order and configs, drops ids missing from React
  Flow, converts relative → absolute positions and reads group sizes from `width`/`height`.
- `editor_store.ts` follows the contract and adds `markSaving()` and `markSaveFailed()` (needed for the
  "saving"/"error" states). `load` resets dirty/selection/saveState.
- `autosave.ts` follows the contract plus a required `onError(error)` option for non-409 failures.
  Saves run one at a time; each save uses the newer of the scheduled revision and the revision returned
  by the previous save. A 409 is detected with `ApiError.status`.
- `use_flow_draft.ts`: `useFlowDraft(flowId)` creates the store, loads the draft with TanStack Query
  (loads into the store inside the query function; no automatic refetch), wires autosave to store
  edits, flushes on `beforeunload` and unmount, and returns `{ store, isLoading, loadError, reload }`.
- Canvas keeps React Flow's measured node sizes in local state (React Flow hides nodes without
  `measured`); position changes go through `applyGraph(fromReactFlow(...))`, selection changes through
  `select`. Logic lives in `use_canvas_elements.ts`; provisional node/group components in
  `provisional_nodes.tsx`; pt-BR node type labels in `canvas/base/node_type_labels.ts`.
- Flow name comes from `GET /projects/:projectId/flows` (no single-flow GET) in
  `src/web/app/flows/use_flow_summary.ts`.

## Tasks

- [x] 1. Test + implement `toReactFlow` (relative positions, groups with parentId, nested groups, edges) — `src/web/canvas/graph_mapping.ts`
- [x] 2. Test + implement `fromReactFlow` round trip (canonical + loop flows, moved node inside nested group) — `src/web/canvas/graph_mapping.ts`
- [ ] 3. Test + implement `createEditorStore` (`load`, `applyGraph` immutable + dirty, `select`, save states) — `src/web/canvas/editor_store.ts`
- [ ] 4. Test + implement `createAutosave` debounce — `src/web/canvas/autosave.ts`
- [ ] 5. Test + implement autosave serial saves with returned revision — `src/web/canvas/autosave.ts`
- [ ] 6. Test + implement autosave conflict and error reporting — `src/web/canvas/autosave.ts`
- [ ] 7. Test + implement autosave `flush` — `src/web/canvas/autosave.ts`
- [ ] 8. Provisional node and group components + node type labels — `src/web/canvas/provisional_nodes.tsx`, `src/web/canvas/base/node_type_labels.ts`
- [ ] 9. Test + implement `FlowCanvas` rendering the canonical flow's nodes (Background, MiniMap, Controls, zoom 25–200%, fitView, compact below 50%) — `src/web/canvas/flow_canvas.tsx`, `src/web/canvas/use_canvas_elements.ts`
- [ ] 10. Implement `useFlowDraft` (load, autosave wiring, flush on beforeunload/unmount, reload) — `src/web/canvas/use_flow_draft.ts`
- [ ] 11. Test + implement `FlowEditorPage` (top bar with name and save state, conflict banner with reload, side panels) — `src/web/app/flows/flow_editor_page.tsx`, `src/web/app/flows/use_flow_summary.ts`
- [ ] 12. Self-review checklist and feedback loops (typecheck, lint, test)
