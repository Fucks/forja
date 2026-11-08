# Issue #47: Orçamentos de tokens e custo por run, nó e dia

## Decisions

- `src/engine/budgets.ts` holds the contract types (`BudgetLimit`, `RunBudget`, `UsageTotals`) and the pure
  `checkBudget`. A limit is reached when the spent amount is `>=` the limit; missing limits never block.
  Scopes are checked in the order run → node → daily; `today` = `daily.alreadySpent*` + run totals.
- `src/engine/run_budget_guard.ts` (new, small class like `NodeRunTimeouts`): keeps the current budget and the
  usage per node id, answers `findExceeded(nodeId)`. The scheduler owns one instance.
- Usage per node goes into the snapshot (`usageByNode?`) so a restored scheduler remembers what was spent.
- Budget is enforced only for agent NodeRuns (`plan.isLimitedByConcurrency`) that are QUEUED and due, inside the
  `moveItemsThroughGroups` loop (after `queueReadyNodeRuns`), so a budget failure in a map settles its item in
  the same pass. `advance` stops before starting anything when the run got paused.
- `onExceeded: "fail"` needs `QUEUED → FAILED` in `node_run_state.ts` (the NodeRun never started); failure kind
  `budget` already gives up in `decideRetry`, then the normal failure policy (`retryOrGiveUp`) applies.
- Harness (`src/test/factories/scheduler_harness.ts`) gains `budget` option, `usage` in `NodeBehavior`
  (delivered as `usage_recorded` before the finishing event) and `raiseBudget(budget)`.

## Tasks

- [ ] 1. Test + implement `checkBudget` for run scope (cost and tokens, missing limits) — `src/engine/budgets.ts`, `budgets.test.ts`
- [ ] 2. Test + implement node scope and daily scope (already spent + run totals) — `budgets.ts`, `budgets.test.ts`
- [ ] 3. Contracts in scheduler types: `budget?` option, `usage_recorded`, `budget_raised`, `usageByNode` snapshot — `scheduler_types.ts`, `scheduler_snapshot.ts`
- [ ] 4. `RunBudgetGuard` (records usage per node, raises budget, finds exceeded scope) — `src/engine/run_budget_guard.ts`
- [ ] 5. Harness: budget option, usage per script, `raiseBudget` — `src/test/factories/scheduler_harness.ts`
- [ ] 6. Test: with run.maxCostUsd 1 and agents costing 0.40, the 4th agent does not start and the run pauses with `budget` — `scheduler.test.ts`, `scheduler.ts`
- [ ] 7. Test: running NodeRuns at the moment of the block finish normally — `scheduler.test.ts`
- [ ] 8. Test: per-node limit blocks only that node — `scheduler.test.ts`
- [ ] 9. Test: usage recorded before the success event still counts — `scheduler.test.ts`
- [ ] 10. Allow `QUEUED → FAILED` — `node_run_state.ts`, `node_run_state.test.ts`
- [ ] 11. Test + implement `onExceeded: "fail"` fails the NodeRun with kind `budget` without retry — `scheduler.test.ts`, `scheduler.ts`
- [ ] 12. Test + implement `budget_raised` resumes the paused run — `scheduler.test.ts`, `scheduler.ts`
- [ ] 13. Test: usage survives snapshot/restore — `scheduler.test.ts`
- [ ] 14. Self-review checklist (section 5) and feedback loops (section 6)
