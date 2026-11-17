# Issue #188: Paleta por categorias, cartão de detalhes, Map e Loop na paleta e adicionar a partir da porta

## Decisions

- `PaletteItem` follows the issue contract; `GroupKind` comes from `@/web/docs/node_docs/node_doc.js`.
  Items are generated from `NODE_DOCS` (title, tagline, category); icons from `NODE_TYPE_ICONS` and
  `GROUP_KIND_ICONS`.
- `filterPaletteItems` searches label, tagline and the doc's `whenToUse`. The condition doc's first
  `whenToUse` says "aprovar ou reprovar" so "aprovar" finds Decisão (criterion); `npm run docs:nodes`
  regenerates `docs/nos`.
- `listCompatibleNodeTypes(portType, from)` lives in `compatible_node_types.ts`: it builds a probe node
  with a single port of `portType` next to the default node of each type and asks `checkConnection`.
  `findFirstCompatiblePort(nodeType, portType, from)` in the same file picks the port the new edge uses.
  `from` is the side of the dragged handle (`"source"` = dragged out of an output).
- `createEmptyGroup(graph, kind, position, newId)` in `grouping.ts` mirrors `groupNodes`
  (returns `{ graph, groupId }`), so the id comes from the caller; the group is nested in the group under
  the point. The issue writes `createEmptyGroup(kind, position)`; graph and newId were added to keep it pure.
- `use_add_node.ts` gains `addGroupAtPoint(kind, point)` and `addGroupAtViewportCenter(kind)`: with selected
  nodes that `canGroup`, it wraps them with `groupNodes`; otherwise it creates an empty group.
- Dragging a group uses the same drag format; `readDraggedNodeType` becomes `readDraggedPaletteItem` (own `GROUP_KIND_DRAG_FORMAT`) returning
  `{ kind: "node", type } | { kind: "group", type }`.
- An empty group frame shows "Arraste nós para dentro" (`GroupFrame` gets `isEmpty`).
- Add-from-port: new hook `src/web/canvas/palette/use_add_from_port.ts` (extra file) holds the open menu state
  and creates node + edge in one `applyGraph` (one history entry).
- Detail card: no popover package is installed, so `node_palette_detail.tsx` is the card view (`w-80`,
  popover elevation) and `palette_detail_anchor.tsx` (extra file) opens it on hover after
  `TOOLTIP_OPEN_DELAY_MS`, on focus, and moves focus into it on Shift+F10 / ContextMenu; Esc closes.
  `palette_entry.tsx` (extra file) holds `PaletteEntry`, so `node_palette.tsx` stays under 200 lines.

## Tasks

- [x] 1. Test + implement `listCompatibleNodeTypes` and `findFirstCompatiblePort` — `compatible_node_types(.test).ts`
- [x] 2. `PaletteItem` with `kind`, `category`; map and loop entries; search in `whenToUse` (+ condition doc
      wording, regenerate docs) — `palette_items.ts`, `node_palette.test.tsx`
- [x] 3. Palette sections per category, collapsible, in `NODE_CATEGORIES` order with count — `node_palette.tsx`
- [x] 4. Arrow keys move between entries — `node_palette.tsx`
- [x] 5. `createEmptyGroup` in grouping — `grouping.ts`, `grouping.test.ts`
- [x] 6. Add group from the palette (click: empty at center or wrap selection) — `use_add_node.ts`, palette test
- [x] 7. Drag a group from the palette onto the canvas — `node_type_drag.ts`, `use_node_drop.ts`, canvas test
- [x] 8. Empty group shows "Arraste nós para dentro" — `group_frame.tsx`, `group_node.tsx`
- [x] 9. Detail card (tagline, what it does, ports with label and type icon, first example, Documentação
      completa opens `NodeDocDrawer`) — `node_palette_detail.tsx`, palette test
- [x] 10. `AddFromPortMenu` with search, positioned at the drop point, Esc closes — `add_from_port_menu.tsx`
- [x] 11. `onConnectEnd` on empty space opens the menu; choosing creates node + edge in one history entry —
      `use_add_from_port.ts`, `flow_canvas.tsx`, `flow_canvas.test.tsx`
- [ ] 12. Self-review checklist and feedback loops
