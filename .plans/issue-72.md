# Issue #72: Board kanban com colunas derivadas do fluxo

## Decisions

- `src/engine/board_columns.ts` holds `BoardColumnDef`, `deriveColumns`, `placeItem` (pure). Fixed column
  ids: `backlog`, `blocked`, `needs_human`, `done`; stage ids: `stage:<groupOrNodeId>`.
- A stage is the outermost map enclosing a node, or an agent/gate/git node outside any map, in
  `topologicalOrder` (from `graph_queries.ts`), deduplicated.
- `placeItem` status is typed `NodeRunStatusName` (engine can't import `web/`'s `ExecutionStatus`, which
  is a superset). The current node is the first non-terminal NodeRun of the latest run in topological
  order whose node belongs to a stage.
- `BoardView` (API shape) lives in `src/shared/board_types.ts` (new file, not in the issue's list) so both
  server and web import it.
- `board_service.ts` deps: `workItems: Pick<WorkItemService,"list"|"isBlocked">`,
  `flows: Pick<FlowService,"list"|"getVersion">`, `runs: Pick<RunRepository,"latestNodeRunsByItem"|"listArtifacts">`,
  `usage: Pick<UsageService,"aggregate">` (groupBy item, all time), `clock`.
  Outcome comes from the `item_outcome` json artifact (`{ moveItemTo }`) of the output node; PR from
  the `pr_url` artifact. Closed items only when `updatedAt` is within the last 7 days.
- Web: `use_board.ts` = react-query `["board", projectId]` + `useEventStream` invalidating on
  `node_run.updated`, `work_item.*`, `run.finished`; sync mutation POSTs the existing
  `/projects/:projectId/work-items/sync`. `board_view.tsx` exports `ProjectBoard`; card in `work_item_card.tsx`.

## Tasks

- [x] 1. Test+impl: canonical flow derives Backlog, Bloqueado, Especificar, Desenvolver, Revisar e abrir PR, Precisa de humano, Concluído; agent/gate/git outside maps become stages — `src/engine/board_columns.ts`
- [x] 2. Test+impl: `placeItem` priority rules (manual column, outcome, closed, active node run → stage, blocked, backlog) — `src/engine/board_columns.ts`
- [x] 3. Add `BoardView` type — `src/shared/board_types.ts`
- [x] 4. Test+impl: board service without published default flow returns only fixed columns — `src/server/work_items/board_service.ts`
- [x] 5. Test+impl: board service places cards with status, current node label, cost, PR url, run id; outcome needs_human from exhausted loop; blocked; closed older than 7 days hidden — `board_service.ts`
- [x] 6. Route `GET /api/projects/:projectId/board` + route test — `work_items_routes.ts`
- [ ] 7. Web: `use_board.ts`, `work_item_card.tsx`, `board_view.tsx`, `board_page.tsx` with tests (render, live update on event, sync, no-flow warning) — `board_view.test.tsx`
- [ ] 8. Self-review checklist and feedback loops (typecheck, lint, test)
