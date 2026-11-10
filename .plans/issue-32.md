# Issue #32: Paleta de nós: arrastar para criar

## Decisions

- `PALETTE_ITEMS` reuses `NODE_TYPE_LABELS` and `NODE_TYPE_ICONS` (`src/web/canvas/base/`); only trigger has `singleton: true`.
- `findDropGroup` / `addNodeAt` work in flow coordinates (absolute, like `FlowGraph`); the screen → flow
  conversion (`screenToFlowPosition`) happens in the canvas. Innermost group = smallest containing area
  (groups never partially overlap). `addNodeAt` uses `createDefaultNode` with the point as top-left.
- New node ids: `newId("nod")` from `src/lib/ids.ts` (adds the `nod` prefix).
- `src/web/canvas/palette/use_add_node.ts` (extra file): hook shared by palette click and canvas drop;
  adds via `store.applyGraph` and selects the new node. Click places the node at the viewport center,
  read from React Flow's store (`width`, `height`, `transform`).
- One `ReactFlowProvider` wraps palette + canvas in `EditorWorkspace`; `FlowCanvas` uses `useReactFlow`,
  so `flow_canvas.test.tsx` renders it inside a provider.
- Drag payload: `dataTransfer` with `application/forja-node-type`, helpers in `palette/node_type_drag.ts`;
  drop ignores unknown types. Search lives in `filterPaletteItems` (`palette_items.ts`).
- Disabled trigger uses `aria-disabled` (not `disabled`) so the tooltip still opens on hover/focus.
- Drop highlight: `DropTargetGroupContext` (`src/web/canvas/palette/drop_target_highlight.ts`) set by the
  canvas on drag over; `GroupNode` outlines itself as selected when it is the target.

## Tasks

- [x] 1. `PALETTE_ITEMS` in the issue's order with the issue's descriptions — `palette/palette_items.ts`
- [x] 2. Test + implement `findDropGroup` (innermost, outside groups) — `palette/drop_target.ts`
- [x] 3. Test + implement `addNodeAt` (default ports, position, parentGroupId, deterministic ids) — `palette/drop_target.ts`
- [x] 4. `nod` id prefix + `useAddNode` hook (add + select, viewport center) — `src/lib/ids.ts`, `palette/use_add_node.ts`
- [x] 5. Test + implement palette list, click creates and selects node — `palette/node_palette.tsx`, `palette/node_palette.test.tsx`
- [x] 6. Test + implement search by name and description — `palette/node_palette.tsx`
- [x] 7. Test + implement trigger disabled with tooltip when flow has one — `palette/node_palette.tsx`
- [ ] 8. Drag start sets `application/forja-node-type`; canvas `onDragOver`/`onDrop` creates node — `flow_canvas.tsx`
- [ ] 9. Drop target group highlight — `palette/drop_target_highlight.ts`, `flow_canvas.tsx`, `nodes/group_node.tsx`
- [ ] 10. Mount palette in the left panel with shared `ReactFlowProvider` — `flow_editor_page.tsx`
- [ ] 11. Self-review checklist and feedback loops (typecheck, lint, test)
