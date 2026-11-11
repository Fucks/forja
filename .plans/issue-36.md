# Issue #36: Agrupar seleção em loop ou map no canvas

## Decisions

- Pure grouping rules live in `src/web/canvas/grouping.ts` with the contract names of the issue.
  `groupNodes` throws `GroupingRejectedError(reason)` when `canGroup` refuses.
- Node size is not in the `FlowGraph`: the frame uses `NODE_FRAME_SIZE` (240 × 120, the `w-60` card).
  Frame = node bounds + 40 px padding, + 32 px more on top for the label.
- After grouping/fitting, enclosing groups only grow (never shrink) to keep containing the new frame.
- `ungroup` lifts child nodes/groups to the group's parent, keeps node edges, drops edges that start at
  the removed group itself (`exhausted` port) since they would dangle.
- `reparentNode` reuses `findDropGroup` (palette/drop_target.ts); the trigger never enters a group.
- Defaults come from the schemas: `mapConfigSchema.parse({})`, `loopConfigSchema.parse({ until })` with
  `UNDEFINED_LOOP_CONDITION = { op: "exists", path: "" }`.
- Validation: new error `loop_without_condition` in `src/engine/validation_rules/loop_rules.ts` when a
  condition path is blank; blank paths no longer raise `loop_condition_unknown_port`.
- Group ids use a new `"grp"` prefix in `src/lib/ids.ts`.
- Map icon becomes `Layers` in `group_frame.tsx` (design note).
- Carry ports edited as switches over output port names of nodes inside the loop.

## Tasks

- [x] 1. `canGroup` verdicts (empty, trigger, different groups) — `grouping.ts`/`grouping.test.ts`
- [x] 2. `groupNodes` frame, defaults, common parent, ancestors grow — `grouping.ts`
- [x] 3. `ungroup` lifts children to the parent (loop inside map) — `grouping.ts`
- [x] 4. `reparentNode` in/out of groups — `grouping.ts`
- [x] 5. `fitGroupToChildren` — `grouping.ts`
- [x] 6. Validation error for a loop without condition — `loop_rules.ts`, `graph_validation.ts`
- [ ] 7. `GroupInspector` map fields (concurrency, barrier, failFast) — `group_inspector.tsx`/test
- [ ] 8. `GroupInspector` loop fields (teto, condição, carry) — `group_inspector.tsx`/test
- [ ] 9. `InspectorPanel` routes a selected group to `GroupInspector` — `inspector_panel.tsx`
- [ ] 10. Selection toolbar with disabled reasons and `G M`/`G L` shortcuts — `selection_toolbar.tsx`,
      `flow_canvas.tsx`, `flow_canvas.test.tsx`
- [ ] 11. Group context menu (Desagrupar, Ajustar ao conteúdo) — `flow_canvas.tsx`
- [ ] 12. Reparent on `onNodeDragStop`; resize handles on the selected group — `flow_canvas.tsx`,
      `group_node.tsx`, `use_canvas_elements.ts`, `Layers` icon
- [ ] 13. Self-review checklist and feedback loops
