# Issue #66: Histórico de runs

## Decisions

- `RunListItem` (contract of the issue) lives in `src/shared/run_types.ts`; the server builds it with ISO
  date strings in a pure `toRunListItem` (`src/server/runs/run_list_item.ts`), so the web and the API share it.
- `RunService.listRuns` returns `RunListItem[]`. Per page it loads the project flows once (flow names, archived
  included) and the project triggers once (trigger names); the cost of each run is the sum of
  `usage.forRun(runId)` (`usage_service.forRun` exists, #59). `RunServiceDeps` gains
  `usage: Pick<UsageService, "forRun">` and `triggers: Pick<TriggerRepository, "listByProject">`.
- `durationMs` only for runs that started and finished; active runs show no duration.
- `itemCount = itemIds.length`, `failedItemCount = failedItemIds.length`.
- `useRuns` uses `useInfiniteQuery` with the `before` cursor (id of the last run of the page), page size 50;
  `select` flattens the pages and puts active runs (QUEUED/RUNNING/PAUSED) on top, newest first otherwise.
  `useEventStream({ projectId })` invalidates the list on `run.*` events.
- Status filter options: Todos, Ativas (QUEUED+RUNNING+PAUSED), Sucesso, Falha, Cancelado.
- "Nova run": only flows with `latestVersion` and not archived; item ids typed separated by comma/space;
  "Executar" posts to `/projects/:projectId/runs` and navigates to `/projects/:projectId/runs/:runId`.
- "Últimas runs" card reuses `useRuns(projectId, {})` and shows the first 5.
- Page tests stub the global `EventSource` to capture the stream (the jsdom polyfill already stubs it).

## Tasks

- [ ] 1. Test + impl: `listRuns` answers `RunListItem` with flowName, itemCount, failedItemCount, durationMs,
      costUsd, triggerName — `src/shared/run_types.ts`, `src/server/runs/run_list_item.ts`,
      `src/server/runs/run_service.ts`, `src/server/runs/run_service.test.ts`
- [ ] 2. Wire the usage service and trigger repository in the routes; route test uses `RunListItem` —
      `src/server/runs/runs_routes.ts`, `src/server/runs/runs_routes.test.ts`
- [ ] 3. Test: the runs page lists runs with state, flow/version, items, duration, cost and trigger, active on
      top; impl `use_runs.ts`, `runs_table.tsx`, `runs_page.tsx` — `src/web/app/runs/runs_page.test.tsx`
- [ ] 4. Test + impl: clicking a row opens the run — `runs_table.tsx`
- [ ] 5. Test + impl: status and flow filters ("Falha" shows only failed runs) — `runs_page.tsx`
- [ ] 6. Test + impl: "Carregar mais" pages by the `before` cursor — `use_runs.ts`, `runs_page.tsx`
- [ ] 7. Test + impl: a `run.*` event reloads the list — `use_runs.ts`
- [ ] 8. Test + impl: "Nova run" starts the run and opens it — `new_run_dialog.tsx`
- [ ] 9. Test + impl: "Últimas runs" card on the project overview — `recent_runs_card.tsx`,
      `project_page.tsx`
- [ ] 10. Self-review checklist (section 5) and feedback loops (section 6)
