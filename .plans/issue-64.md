# Issue #64: Drawer do nó com NodeRuns, entradas e saídas

## Decisions

- `sortNodeRuns` / `describeNodeRun` live in `src/web/canvas/live/node_run_sorting.ts`; they are generic over
  the fields they read (`status`, `workItemId`, `iteration`, `attempt`), so they accept both the engine's
  `NodeRunState` and the web's `SerializedNodeRun`. Items compare numerically ("2" before "10"); NodeRuns
  without an item come first. `describeNodeRun` omits the item when absent and the iteration when 0
  (outside loops); reuses `describeItem` from `run_view_model.ts`.
- `ARTIFACT_KINDS`/`ArtifactKind` move to `src/shared/run_types.ts`, which also gets `SerializedArtifact`
  and `SerializedNodeRunDetail` (the body of `GET /api/node-runs/:id`). Server `ArtifactRecord` becomes an
  alias of `SerializedArtifact` (artifacts are already JSON).
- The list comes from the live `view.nodeRuns` (events keep it current); the detail is fetched with
  `GET /api/node-runs/:id`, keyed by id + status so it reloads when the NodeRun changes.
- Cost per NodeRun: `GET /api/runs/:runId/usage`, summed by `nodeRunId` (`use_node_run_costs.ts`).
- Actions in `use_node_run_actions.ts`: POST `/node-runs/:id/cancel|retry`, then invalidate the run view.
  Cancel for RUNNING/QUEUED, Repetir for FAILED/CANCELED/SUCCEEDED, each with a confirmation Dialog.
- Error kinds translated in `node_run_error_labels.ts` (Record<NodeRunErrorKind, string>).
- Drawer: existing `Drawer` side="bottom"; height is a fraction of the window (30–80%, default 45%) set
  by a `role="separator"` handle (drag + arrow keys) in `drawer_resize_handle.tsx`.
- `FlowCanvas` readOnly variant gets `onNodeClick(nodeId)`; `RunCanvas` opens the drawer only for flow
  nodes (not groups). Copy uses `copyToClipboard` from `src/web/logs/log_clipboard.ts`.

## Tasks

- [x] 1. Test + implement `sortNodeRuns` — `node_run_sorting.ts`, `node_run_sorting.test.ts`
- [x] 2. Test + implement `describeNodeRun` — same files
- [x] 3. Shared types for the NodeRun detail (move ARTIFACT_KINDS) — `src/shared/run_types.ts`, server imports
- [x] 4. `JsonView` (collapsible tree, truncation with "ver tudo", copy) — `json_view.tsx`
- [ ] 5. Test: drawer lists the node's NodeRuns sorted, RUNNING first, with cost — `node_run_drawer.test.tsx`; implement `node_run_drawer.tsx`, `node_run_list.tsx`, `use_node_run_costs.ts`, `drawer_resize_handle.tsx`
- [ ] 6. Test: selecting a NodeRun shows inputs and outputs as JSON — implement `node_run_detail.tsx`
- [ ] 7. Test: structured output error shows translated kind and message — `node_run_error_labels.ts`
- [ ] 8. Test: retrying a failed NodeRun calls the API and the new NodeRun appears live — `use_node_run_actions.ts`
- [ ] 9. Test: cancel a running NodeRun with confirmation
- [ ] 10. Clicking a node in `RunCanvas` opens the drawer — `flow_canvas.tsx`, `run_canvas.tsx`, test in `run_canvas.test.tsx`
- [ ] 11. Self-review checklist (section 5) and feedback loops (section 6)
