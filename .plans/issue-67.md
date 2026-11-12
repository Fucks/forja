# Issue #67: Painel de uso de tokens e custo

## Decisions

- The API already exists: `GET /api/projects/:projectId/usage?from&to&groupBy[&flowId]` answers
  `UsageAggregate[]` (day keys are `YYYY-MM-DD` in the project time zone) and
  `GET /api/runs/:runId/usage` answers `UsageRecord[]`.
- `UsageRow` (contract of `useUsage`) is an alias of `UsageAggregate`, exported from `use_usage.ts`.
- "Clicking a node row filters by that node": the query gets an optional `nodeId` (additive to the
  contract), added to `usageQueryParams`/`UsageQuery` and the repository `where`.
- The period is computed in the project time zone (from `useProjectSettings`): `startOfLocalDay` and
  `addDays` extend `src/lib/local_day.ts`; the pure period logic lives in
  `src/web/app/usage/usage_period.ts`. `from` is the start of the first day, `to` the start of the
  day after the last one (the server excludes `to`).
- The chart is plain HTML/CSS bars (`<ol aria-label="Tokens por dia">`, one `<li>` per day) with the
  existing `Tooltip`; recharts renders nothing measurable in jsdom (ResponsiveContainer is 0 px).
  Input in `bg-steel`, output in `bg-accent`, axes in `text-muted`, legend for the two series.
- "Hoje" card: today's usage via `useUsage(groupBy: "day")` for today, budget from
  `dailyBudgetUsd`; progress bar `role="progressbar"`; above 80% in `bg-status-waiting-approval`.
- Drawer: `use_node_run_costs.ts` becomes `use_node_run_usage.ts` (`useNodeRunUsage`) returning the
  summed usage per NodeRun; the list reads `.costUsd`, the detail shows a KeyValue (model, input,
  output, cache read, cache write, cost with "≈" when `priceEstimated`). `addUsage`/`EMPTY_USAGE`
  for `TokenUsage` move from `claude_result.ts` to `src/shared/usage_types.ts` so the web reuses them.
- `priceEstimated` only exists per record, so the "≈" mark is shown in the drawer only.

## Tasks

- [x] 1. Server: filter the usage by node when `nodeId` is given — `usage_types.ts`,
      `usage_repository.ts`, `usage_service.test.ts`
- [x] 2. `startOfLocalDay` and `addDays` — `src/lib/local_day.ts` (+ test)
- [x] 3. `formatCalendarDay` ("12/11") — `src/lib/format.ts` (+ test)
- [x] 4. Period choices to `{ from, to, days }` — `src/web/app/usage/usage_period.ts` (+ test)
- [x] 5. `useUsage` hook — `src/web/app/usage/use_usage.ts`
- [x] 6. Page test + implementation: grouping by node shows each node's cost — `usage_page.tsx`,
      `usage_table.tsx`, `usage_page.test.tsx`
- [x] 7. Page test + implementation: 7-day chart with one bar per day, including empty days —
      `usage_chart.tsx`
- [x] 8. Page test + implementation: clicking a node row filters by that node
- [x] 9. Page test + implementation: "Hoje" card vs daily budget (with and without budget, >80%) —
      `usage_today_card.tsx`
- [x] 10. Page test + implementation: custom period
- [ ] 11. Move `addUsage`/`EMPTY_USAGE` to `src/shared/usage_types.ts`
- [ ] 12. Drawer test + implementation: NodeRun detail shows tokens and cost — `use_node_run_usage.ts`,
      `node_run_list.tsx`, `node_run_drawer.tsx`, `node_run_detail.tsx`
- [ ] 13. Self-review checklist and feedback loops (typecheck, lint, test)
