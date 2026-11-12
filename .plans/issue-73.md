# Issue #73: Detalhe do item de trabalho com linha do tempo

## Decisions

- `ItemTimelineEntry` and `ItemTimeline` (the return of `buildItemTimeline`) live in
  `src/shared/board_types.ts` so the web can import them; `item_timeline.ts` uses them.
- New repository method `RunRepository.listNodeRunsOfItem(itemId)` (SQLite + in-memory, covered in
  `sqlite_run_repository.test.ts`) — the repo had no query across runs for one item.
- Cost per entry = sum of `usage.forRun(runId)` records with that `nodeRunId`; absent when none.
- Flow name from `flows.list(run.projectId, { includeArchived: true })`; node label from
  `flows.getVersion(run.flowId, run.flowVersion).graph`.
- Entries sorted by `startedAt` desc; not-started entries come first.
- `prUrl`: newest `pr_url` artifact of the item's NodeRuns. `spec`: `outputs.summary` of the
  earliest-started NodeRun of the latest run whose node is in the stage labeled "Especificar"
  (uses `stageColumnIdOfNode`, exported from `src/engine/board_columns.ts`).
- Deep link: `/projects/:p/runs/:r?nodeRun=<id>` (`nodeRunPath` in `navigation.ts`); `RunPage`
  reads it, `RunCanvas` opens the node, `NodeRunDrawer` preselects the NodeRun.
- Board hooks `useItemTimeline` and `useMoveItemToColumn` go in `use_board.ts`; moving invalidates the
  board query. Card opens via a button on its title (card has a PR link, so the article can't be a button).
- Description rendered as plain text with preserved line breaks (no Markdown dependency exists).

## Tasks

- [x] 1. Test + implement `listNodeRunsOfItem` across runs — `run_repository.ts`, `sqlite_run_repository.ts`, `in_memory_run_repository.ts`, `sqlite_run_repository.test.ts`
- [x] 2. Test + implement `buildItemTimeline` entries of all runs, newest first, with flow name and node label — `src/server/work_items/item_timeline.ts`, `.test.ts`, `src/shared/board_types.ts`
- [x] 3. Test + implement entry cost and total cost — `item_timeline.ts`
- [x] 4. Test + implement `prUrl` and `spec` — `item_timeline.ts`, `src/engine/board_columns.ts`
- [x] 5. Route `GET /api/work-items/:id/timeline` + route test — `work_items_routes.ts`, `work_items_routes.test.ts`
- [ ] 6. Run page opens the NodeRun given by `?nodeRun=` — `navigation.ts`, `run_page.tsx`, `run_canvas.tsx`, `node_run_drawer.tsx`, `run_canvas.test.tsx`
- [ ] 7. Test + implement drawer header, description, blockers, spec, timeline (entry links to run with NodeRun) — `work_item_drawer.tsx`, `item_timeline.tsx`, `use_board.ts`, `work_item_drawer.test.tsx`
- [ ] 8. Test + implement manual column actions — `work_item_drawer.tsx`, `use_board.ts`
- [ ] 9. Board opens the drawer on card click; moving to "Precisa de humano" updates the card — `board_view.tsx`, `work_item_card.tsx`, `board_view.test.tsx`
- [ ] 10. Self-review checklist and feedback loops
