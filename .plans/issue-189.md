# Issue #189: Portas com nome amigável, tipo e tooltip; selos de item automático e falta configurar

## Decisions

- `describePort(nodeType, port)` returns `{ label: string; description?: string }`: catalog `PortDoc`
  first (inputs, then outputs); for a user port, the label is its name and the description is
  `port.description` (absent when the user wrote none, so the tooltip leaves that line out).
- `BaseNode` stays generic: its ports carry `label`, `description?`, `type: PortType`, and an input may
  carry a `badge` node shown after the label. `FlowNodeCard` decides which badges to show.
- Implicit item rule: input `item` without an incoming edge on a node whose `planNodeScopes` scope is
  `"item"` (the engine's rule; the exported name is `planNodeScopes`, not `computeNodeScopes`). Computed
  once per graph in `src/web/canvas/implicit_item_overlay.tsx` (context + `useHasImplicitItem`), provided
  by `EditableFlowCanvas` next to `ConnectionGraphContext` (new file, outside the issue's list).
- "Falta configurar": `useTargetValidation` gains `needsConfiguration` (an `error` issue with
  `target.kind === "node"`). The badge is a plain element inside the node, so clicking it selects the
  node through React Flow, and the inspector shows the selected node.
- Badges hide below zoom 0.6 (`BADGE_ZOOM_THRESHOLD` in `flow_node_card.tsx`).
- `?` is a link to `nodeDocPath(type)` (`/docs/nodes/:type`, new helper in `src/web/config/navigation.ts`)
  opened in a new tab, until `NodeDocDrawer` (#187) exists. `aria-label="Documentação de <typeLabel>"`.
- `PORT_DESCRIPTION_MAX_LENGTH = 200` exported from `flow_graph.ts`; port key order
  `name, type, required, description, schema`.

## Tasks

- [x] 1. `portSchema.description` + port key order in `normalizeFlowGraph`; YAML round trip test —
      `src/shared/flow_graph.ts`, `src/shared/normalize_flow_graph.ts`, `src/server/flows/flow_yaml.test.ts`
- [x] 2. `PORT_TYPE_ICONS` / `PORT_TYPE_LABELS` — `src/web/canvas/base/port_type_icons.ts`
- [x] 3. Test + implement `describePort` — `src/web/canvas/base/port_label.ts`, `port_label.test.ts`
- [x] 4. `PortHandle` shows the friendly label, the type icon and the full tooltip; `BaseNode` port shape;
      update `base_node.test.tsx` and styleguide samples — `port_handle.tsx`, `base_node.tsx`,
      `canvas_samples.tsx`
- [x] 5. `FlowNodeCard` describes its ports with `describePort`; nodes test for "Resultado" + JSON icon +
      tooltip — `flow_node_card.tsx`, `nodes.test.tsx`
- [x] 6. `?` documentation link in the header — `base_node.tsx`, `flow_node_card.tsx`, `navigation.ts`,
      tests in `base_node.test.tsx` and `nodes.test.tsx`
- [x] 7. `listNodesWithImplicitItem` + overlay context; `ImplicitItemBadge` on the item port inside a map
      and not outside — `implicit_item_overlay.tsx`, `node_badges.tsx`, `flow_node_card.tsx`,
      `flow_canvas.tsx`, `nodes.test.tsx`
- [x] 8. `needsConfiguration` in `useTargetValidation`; `NeedsConfigBadge` for an agent with an empty
      prompt, gone once the prompt is filled — `validation_overlay.tsx`, `node_badges.tsx`,
      `base_node.tsx`, `flow_node_card.tsx`, `nodes.test.tsx`
- [x] 9. Badges hidden below zoom 0.6 — `flow_node_card.tsx`
- [x] 10. Natural-language summaries for source, output and trigger — `node_summary.ts`,
      `node_summary.test.ts`, `nodes.test.tsx`
- [ ] 11. "Descrição" field for user ports in the inspector — `port_list_editor.tsx` (+ its test if any)
- [ ] 12. Self-review checklist and feedback loops (typecheck, lint, test)
