# Issue #15: Base visual do canvas: nó, portas, moldura de grupo e arestas

## Decisions

- Components live in `src/web/canvas/base/`; they are presentational (props in, markup out) and get wired
  to React Flow node/edge types in #30/#31.
- `NODE_TYPE_ICONS` is typed `Record<NodeType, LucideIcon>` reusing `NodeType` from `src/shared/flow_graph.ts`.
- Status badge reuses `StatusBadge` (`showLabel={false}`, so its accessible name is the status label);
  RUNNING adds `animate-ember` (reduced motion already disabled in `global.css`).
- Selected/invalid outline is shared by `BaseNode` and `GroupFrame` via `canvas_outline.tsx`
  (`outlineClasses`, `InvalidMarker`) so both frames stay consistent.
- xyflow's `style.css` is unlayered and beats Tailwind utilities, so handle/edge/background/controls/minimap
  styling lives in `canvas_theme.css` (plain classes + `--xy-*` variables). The page that renders React Flow
  imports `@xyflow/react/dist/style.css` then `canvas_theme.css`.
- `PortHandle`: left = target handle, right = source handle, handle id = port name; required = filled
  circle, optional = hollow; type shown in `Tooltip`.
- Compact `BaseNode` renders only the header (no summary, no ports); #30 decides edge anchoring when zoomed out.
- Group counters: "N rodando · N na fila · N feitos · N com falha", omitting zero counts (pure
  `formatGroupProgress`).
- `/styleguide/canvas` route is a sibling of `/styleguide` in `routes.tsx`.

## Tasks

- [x] 1. `NODE_TYPE_ICONS` — `src/web/canvas/base/node_type_icons.ts`
- [x] 2. Test + `PortHandle` with name label, type tooltip, required/optional style — `port_handle.tsx`, `base_node.test.tsx`
- [x] 3. Test + `BaseNode` header (icon, labels, status badge with accessible name, badge, invalid marker) — `base_node.tsx`, `canvas_outline.tsx`
- [x] 4. Test + `BaseNode` body (summary, port labels) and compact mode hiding the body — `base_node.tsx`
- [x] 5. Test + `BaseNode` RUNNING ember and selected/invalid outline — `base_node.tsx`
- [x] 6. Test + `GroupFrame` with configLabel and progress counters — `group_frame.tsx`, `group_frame.test.tsx`
- [x] 7. Test + `FlowEdge` bezier with flowing/invalid states — `flow_edge.tsx`, `flow_edge.test.tsx`
- [x] 8. `canvas_theme.css`: dotted background, controls, minimap, handles, edge styles and animation
- [x] 9. Test + `/styleguide/canvas` page with every state, route in `routes.tsx` — `styleguide_canvas_page.tsx`, `app_shell.test.tsx`
- [ ] 10. Self-review checklist (section 5) and feedback loops (section 6)
