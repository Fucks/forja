# Issue #22: Contrato FlowGraph e configs de todos os tipos de nó

## Decisions

- Imports use the `@/` alias with `.js` extension (as in `src/lib/assert_never.test.ts`).
- `src/shared/json_schema.ts` (extra file) holds `jsonSchemaSchema`/`JsonSchema`, shared by `portSchema.schema`
  and `agentConfig.outputSchema`.
- `TRIGGER_KINDS` is exported from `node_configs/trigger_config.ts` so #74 can reuse it.
- `flow_graph.ts` builds one node schema per type with a small helper and joins them in
  `z.discriminatedUnion("type", ...)`; `FlowGraphParseError` lists issues as `path: message`.
- `node_defaults.ts` keeps a typed `NODE_TEMPLATES` record (label in pt-BR, ports, config) and
  `createDefaultNode` clones it with `structuredClone`. Port helpers `requiredPort` / `optionalPort`.
- `evaluateCondition(condition, data)` resolves dotted paths over plain objects; missing path → `false`
  (so `not` of a missing path → `true`).
- Factories in `src/test/factories/flow_graph_factory.ts` are built with `createDefaultNode`. Loop condition
  uses `review.approved == true` (PRD example).

## Tasks

- [x] 1. `agent_types.ts`, `json_schema.ts`, `validation_issue.ts` (pure declarations)
- [x] 2. Test + implement `conditionSchema` and `evaluateCondition` — `src/shared/conditions.ts`, `conditions.test.ts`
- [ ] 3. Config schemas of the eight node types — `src/shared/node_configs/*.ts`
- [ ] 4. Test + implement node/edge/group/graph schemas, `parseFlowGraph`, `FlowGraphParseError` — `flow_graph.ts`, `flow_graph.test.ts` (unknown node type path, group limits)
- [ ] 5. Test + implement `createDefaultNode` with default ports and config per type — `node_defaults.ts`, `node_defaults.test.ts`
- [ ] 6. Test + implement `buildCanonicalFlow` / `buildLoopFlow` and check they parse — `src/test/factories/flow_graph_factory.ts`, `flow_graph.test.ts`
- [ ] 7. Self-review checklist and feedback loops (typecheck, lint, test; nothing in `src/shared/` imports server/web)
