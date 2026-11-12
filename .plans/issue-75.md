# Issue #75: Criar item local e soltar card em coluna-gatilho

## Decisions

- `decideDrop` lives in `src/web/board/drop_rules.ts` with the exact contract signature, plus an
  optional 4th parameter `blockerReferences` (e.g. `["#12"]`): the card only carries blocker ids, and
  the refusal must read "Item bloqueado por #12". Callers with 3 arguments keep working.
- Rule order: running card (status not in `NODE_RUN_TERMINAL`) → not_allowed; target column has an
  enabled `board_column` trigger → start_run (unless the card is in the Bloqueado column); otherwise by
  column kind: backlog/needs_human/done → set_manual_column, stage → "Esta etapa é movida pela
  execução", blocked → not_allowed. Dropping on the origin column is ignored by the UI.
- `BLOCKED_COLUMN` id exported from `src/engine/board_columns.ts` (minimal change) instead of
  repeating `"blocked"`.
- `listBoardColumnTriggers(triggers)` (pure, in drop_rules) maps enabled board_column triggers to
  `{ triggerId, columnId }`.
- Triggers query: `useBoardColumnTriggers(projectId)` in `use_triggers.ts` (`?kind=board_column`).
  `useFireTrigger` now takes `{ triggerId, itemIds? }` (trigger_row updated).
- `useMoveItemToColumn(projectId)` now takes `{ itemId, column }` variables so the board and the
  drawer share it. `useCreateLocalItem(projectId)` added to `use_board.ts`.
- Confirmation text: `Iniciar '<flow name>' para <itemReference>?` — flow name via `useFlows` +
  `findFlowName`.
- DnD with `@dnd-kit/core`: pointer sensor with a small activation distance (clicks still open the
  drawer) and keyboard sensor whose coordinate getter jumps one column per arrow key. Keyboard
  activation is on a drag handle button ("Mover <título>"); Portuguese screen reader announcements.
- Tests mock `getBoundingClientRect` per `[data-board-column]` so dnd-kit can measure in jsdom.

## Tasks

- [x] 1. Test + implement `decideDrop` and `listBoardColumnTriggers` — `src/web/board/drop_rules.ts`,
      `drop_rules.test.ts`, export `BLOCKED_COLUMN` in `src/engine/board_columns.ts`
- [x] 2. API hooks: `useBoardColumnTriggers`, `useFireTrigger` with item ids, `useMoveItemToColumn`
      with item id variables, `useCreateLocalItem` — `use_triggers.ts`, `use_board.ts`,
      `trigger_row.tsx`, `work_item_drawer.tsx`
- [ ] 3. Test: dropping by keyboard on a "Concluído" column saves the manual column —
      `board_dnd.test.tsx`; implement DnD context, draggable cards, droppable columns —
      `board_dnd.tsx`, `board_view.tsx`
- [ ] 4. Test: dropping on a stage without trigger is refused with the reason (toast, no writes)
- [ ] 5. Test: dropping on the trigger column asks for confirmation and fires the trigger with the
      item; cancelling does not fire — start run confirmation dialog
- [ ] 6. Drag highlight (forbidden columns dimmed, allowed accent border) and `Zap` icon on trigger
      columns
- [ ] 7. Test + implement the new item dialog (title, description, labels, blocked by) that creates
      the item in the Backlog — `new_item_dialog.tsx`, `board_view.tsx`, `board_view.test.tsx`
- [ ] 8. Self-review checklist (section 5) and feedback loops (section 6)
