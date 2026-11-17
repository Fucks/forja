# Issue #191: Espaço de nomes único de dados e migração do grafo para schemaVersion 2

## Decisions

- `migrateFlowGraph` (src/shared/migrate_flow_graph.ts) works on `unknown`: it narrows with small type
  guards (no `as`), rewrites only v1 graphs and returns anything else untouched. Path rewrite rules per
  issue: condition → `inputs.value.<path>`, loop `until` → `nodes.<path>`, git `bodyFrom` → `inputs.<path>`.
- `flowGraphSchema = z.preprocess(migrateFlowGraph, flowGraphV2Schema)`; `FlowGraph = z.output<...>`.
  Every reader (repository, YAML, API, clipboard) migrates through it.
- Fixture of the "Padrao" flow: #185 has no JSON, so `src/test/fixtures/standard_flow_v1.json` is the
  review-loop template as it was exported in v1 (prompts shortened). It has a loop `until` and a git
  `bodyFrom`.
- `upstreamOutputs` is computed in the **scheduler** (`startNodeRun`, where `findNodeRun` lives) and travels in
  the `start_node_run` command → `ActiveRun.startNodeRun` → `NodeRunExecutionDeps` → `NodeExecutionContext`.
  The issue points at `executor.ts`, but in this codebase the scheduler owns `findNodeRun`.
- `collectUpstreamOutputs` looks up the NodeRun of the item and falls back to the one without item (per-run
  nodes), so it needs no scope plan; keeps only SUCCEEDED NodeRuns; slugs via `nodeSlug(label)`.
- `buildDataContext(context)` in run_context.ts; `buildPromptContext` delegates to it. `PromptContext` is
  removed; prompt_template uses `DataContext`.
- Prompt variable validation lives in `checkPromptVariables` (prompt_template.ts, injected as `checkPrompt`
  into agent rules); `nodes.<slug>...` is valid when the slug is an upstream node (`listUpstreamNodes`),
  otherwise "Variável aponta para um nó que não vem antes deste".
- Loop: `iterationData` returns `{ nodes: {...} }`; `collectCarry` reads `data.nodes`;
  `findUnknownConditionPathsOfLoop` (loop_rules.ts) now expects `nodes.<slug>`.
- Duplicate slugs: new rule `findDuplicateNodeSlugs` in identity_rules.ts with the issue's message.
- `stored_snapshot.ts` holds no graph: a recovered run reads its graph from the flow version, which already
  goes through `parseFlowGraph`. Nothing to change there.

## Tasks

(Tasks 4 and 5 run after 13: the templates in v2 only pass once the executors read the DataContext.)

- [x] 1. `DataContext` / `DATA_ROOTS` — `src/shared/data_context.ts`
- [x] 2. Test + implement `migrateFlowGraph` rules (version, condition incl. and/or/not, loop until, git
      bodyFrom, v2 untouched, non-graph untouched, idempotence, standard flow fixture) —
      `src/shared/migrate_flow_graph.ts`, `.test.ts`, `src/test/fixtures/standard_flow_v1.json`
- [x] 3. `flowGraphSchema` = preprocess + v2; update `schemaVersion: 1` literals in src/e2e (except migration
      fixtures), flow_graph/flow_service tests that used 2 as "invalid" — `src/shared/flow_graph.ts` & tests
- [x] 6. Move BFS into `listUpstreamNodes` — `src/engine/graph_queries.ts` (+ test)
- [x] 7. Test + implement `collectUpstreamOutputs` (per item, per run, skipped branch absent, SUCCEEDED wins
      over FAILED retry) — `src/engine/upstream_outputs.ts`, `.test.ts`
- [x] 8. Scheduler sends `upstreamOutputs` in `start_node_run`; ActiveRun/NodeRunExecution/
      NodeExecutionContext carry it; context factory default `{}`
- [x] 9. `buildDataContext`; `PromptContext` → `DataContext`; prompt renders `{{nodes.tl.summary}}` —
      `run_context.ts`, `prompt_template.ts` (+ test)
- [x] 10. Prompt variable validation for `nodes.*` (valid upstream, error for downstream/unknown) —
      `prompt_template.ts` (+ test)
- [x] 11. Decisão reads `DataContext` (`nodes.*` and `inputs.value.*`) — `condition_executor.ts`,
      `deterministic_executors.test.ts`
- [x] 12. Git `bodyFrom` reads `DataContext` (`inputs.*`, `nodes.*`) — `git_executor.ts` (+ test)
- [x] 13. Loop `iterationData` under `nodes.*`, carry, loop_rules path check — `loop_group.ts`,
      `loop_rules.ts` (+ tests)
- [x] 4. Templates in v2 with new paths (`inputs.value.*`, `nodes.*`, `inputs.*`) — templates/*.ts + tests
- [x] 5. YAML: importing a v1 template YAML works, exporting writes v2 — `flow_yaml.test.ts`
- [x] 14. Duplicate node slug validation error — `identity_rules.ts` (+ test)
- [x] 15. Suggestions `nodes.<slug>.<port>` for Decisão and Loop using `listUpstreamNodes` —
      `condition_suggestions.ts` (+ test); end-to-end test: a suggested path drives the condition executor
- [ ] 16. Self-review checklist and feedback loops (typecheck, lint, test)
- [x] 17. Default condition path (`node_defaults.ts`) and the paths in test factories in the v2 dialect
