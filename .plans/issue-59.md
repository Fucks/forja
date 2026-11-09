# Issue #59: Registro de uso de tokens e custo estimado

## Decisions

- `TokenUsage` moves from `src/integrations/agent_runtime/agent_runtime.ts` to `src/shared/usage_types.ts`
  (shared by server and web); importers are updated, no re-export.
- `modelPriceSchema` moves to `src/shared/usage_types.ts`; `ModelPrice = z.infer<...>`;
  `settings_types.ts` imports it for `modelPrices`.
- `priceFor` returns `PricedModel` (`ModelPrice & { estimated: boolean }`): exact key → longest key
  that prefixes the model → family name contained in the model (opus, sonnet, haiku, fable) →
  opus price with `estimated: true`. Overrides win over `DEFAULT_MODEL_PRICES`.
- Budget tokens = input + output (as in `src/engine/budgets.ts`); `todaySpent.tokens` uses the same.
- Day grouping and `todaySpent` use a SQLite function `local_day(at, timezone)` registered by the
  usage repository on the connection (`db.$client.function`), so grouping stays in SQL.
- `UsageService` deps: `repo`, `clock`, `newId`, `modelPrices()`, `timezoneOf(projectId)`.
  Prices are read at record time; old records keep their cost.
- Labels: flow → flow name, item → work item title (no item → key `""`, label `Sem item`),
  day/node/model/run → the key itself.
- `NodeExecutionResult.usage` becomes `{ model: string; tokens: TokenUsage }`; the CLI's
  `total_cost_usd` is no longer used by the executor. Failed agents carry no usage (errors have none).
- Daily budget `alreadySpent` = `todaySpent` − usage already recorded for this run (≥ 0), because the
  budget guard adds the run's own usage; same code for start, restore and `raiseRunBudget`.
  Lives in `src/server/runtime/daily_budget.ts` (executor.ts is already >300 lines).
- Table `usage_records` without FKs (like `log_index`): indexes on (project_id, at) and run_id.

## Tasks

- [x] 1. Move `TokenUsage` and `modelPriceSchema` to `src/shared/usage_types.ts`; add `UsageRecord`,
      `UsageQuery`, `UsageAggregate` types
- [ ] 2. Test + implement `DEFAULT_MODEL_PRICES`, `priceFor`, `estimateCostUsd` — `src/server/usage/model_prices.ts` (+ `model_prices.test.ts`)
- [ ] 3. Migration `0650_usage.sql` and schema `src/server/db/schema/usage.ts`
- [ ] 4. Test + implement `record` (cost from configured price, `priceEstimated`) and `forRun` — `usage_service.ts`, `usage_repository.ts`
- [ ] 5. Test + implement `aggregate` for every `groupBy` (+ `flowId` filter, period bounds, labels)
- [ ] 6. Test + implement day grouping in the project timezone (`local_day`)
- [ ] 7. Test + implement `todaySpent(projectId, timezone)`
- [ ] 8. Executor: agent result carries model + tokens; NodeRunExecution records via `UsageService`, publishes `usage.recorded` with the computed cost and delivers `usage_recorded` — executor tests
- [ ] 9. Executor: daily budget gets the spending of today (`daily_budget.ts`) — executor test
- [ ] 10. Wire `UsageService` in `app_executor.ts` and the executor test bed
- [ ] 11. Routes `GET /api/projects/:projectId/usage` and `GET /api/runs/:runId/usage` with validation — `usage_routes.ts` + `usage_routes.test.ts`
- [ ] 12. Self-review checklist (section 5) and feedback loops (section 6)
