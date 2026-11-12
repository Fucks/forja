# Issue #38: Desfazer/refazer, copiar/colar, atalhos e auto-layout

## Decisions

- `createHistory(limit)` keeps a past and a future stack of `FlowGraph`s; `push(graph)` records the graph
  *before* a change and clears the future. `canUndo`/`canRedo` are getters.
- `createEditorStore(clock: Pick<Clock, "now"> = systemClock)`: `applyGraph` records a history step only when
  the previous change is older than `HISTORY_MERGE_WINDOW_MS = 500`, so a drag is one step. An update that
  returns the same graph is ignored. `load` resets the history. `undo`/`redo` mark the draft dirty (autosave).
  History limit `HISTORY_LIMIT = 100`.
- `FlowFragment = { nodes, edges, groups }`, schema `flowFragmentSchema` in `clipboard.ts` (parsed from the
  system clipboard text). Copying a group takes every node and group nested in it; edges only when both ends
  are in the fragment. Pasted elements whose parent is not in the fragment go to the root. Triggers are dropped
  on paste; `containsTrigger(fragment)` lets the caller show the toast.
- `pasteFragment` gets ids from one `newId()` (contract); the canvas passes `() => newId("nod")`.
- Clipboard uses the DOM `copy`/`paste` events (no permission prompt): copy writes JSON to `text/plain` and
  `application/json`; paste prefers the clipboard's JSON, falling back to the editor's internal copy. Paste lands
  at the viewport center (`findViewportCenter`, exported from `use_add_node.ts`); duplicate lands offset by
  `DUPLICATE_OFFSET_PX` from the original.
- `shortcuts.ts`: `SHORTCUTS`, `findShortcutCommand(event)` (pure) and `isTypingTarget` (moved from
  `use_grouping_shortcuts.ts`; CodeMirror is contentEditable, so its own Ctrl+Z wins). Keydown wiring lives in
  `use_editor_shortcuts.ts`; Delete stays with React Flow, `G M`/`G L` stay in `use_grouping_shortcuts.ts`.
- `autoLayout` uses `elkjs/lib/elk.bundled.js`, `layered`, direction RIGHT, `hierarchyHandling: INCLUDE_CHILDREN`,
  node size = `nodeFrame(node).size`; groups are compound nodes with padding for the label.
- Canvas toolbar (top-right Panel): Desfazer, Refazer, Organizar, Atalhos. `flow_canvas.test.tsx` renders inside
  `ToastProvider`.

## Tasks

- [x] 1. Test + implement `createHistory` (push/undo/redo/limit/canUndo/canRedo) — `history.ts`, `history.test.ts`
- [x] 2. Test + implement store `undo`/`redo`/`canUndo`/`canRedo` with 500 ms merge — `editor_store.ts`, `editor_store.test.ts`
- [x] 3. Test + implement `copySelection` — `clipboard.ts`, `clipboard.test.ts`
- [x] 4. Test + implement `pasteFragment` (new ids, internal edges, trigger ignored) — `clipboard.ts`, `clipboard.test.ts`
- [ ] 5. Test + implement `autoLayout` (no overlap, children inside frame) — `auto_layout.ts`, `auto_layout.test.ts`
- [ ] 6. `SHORTCUTS`, `findShortcutCommand`, `isTypingTarget` + tests — `shortcuts.ts`, `shortcuts.test.ts`, `use_grouping_shortcuts.ts`
- [ ] 7. Clipboard hook (copy/paste/duplicate events + toast) — `use_canvas_clipboard.ts`
- [ ] 8. Editor shortcuts hook + shortcuts dialog — `use_editor_shortcuts.ts`, `shortcuts_dialog.tsx`
- [ ] 9. Canvas wiring: toolbar (undo/redo/Organizar/atalhos), shortcuts, clipboard; canvas tests — `flow_canvas.tsx`, `use_auto_layout.ts`, `flow_canvas.test.tsx`
- [ ] 10. Self-review checklist and feedback loops (typecheck, lint, test)
