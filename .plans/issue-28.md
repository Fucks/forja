# Issue #28: Exportar e importar fluxo em YAML

## Decisions

- `src/server/flows/flow_yaml.ts` holds the contract (`FlowFile`, `flowToYaml`, `yamlToFlow`,
  `FlowFileError`) plus the pure `normalizeFlowGraph` (sorts nodes/groups by id, edges by
  `from.nodeId, from.port, to.nodeId, to.port`, rounds positions, orders keys) and `flowFileName`.
- Key order is set by rebuilding objects with `Object.assign(orderedKeys, value)` (no casts).
- `yaml.stringify` with `lineWidth: 0` and `blockQuote: "literal"` → multiline strings as `|`.
- `FlowFileError extends DomainValidationError` so the existing error handler answers 422; its
  `issues` are a discriminated union: `{ kind: "syntax", line, column, message }` |
  `{ kind: "content", path, message }`.
- File schema reuses `flowGraphSchema` and the flow name schema (`flowNameSchema`, now exported from
  `src/shared/flow_types.ts`). `forja` other than 1 is checked first, with its own message.
- Service gains `exportFlow(flowId, version: number | "draft"): Promise<FlowFile>` and
  `importFlow(projectId, yamlText): Promise<FlowSummary>` (small change to `flow_service.ts`).
- Routes: `GET /flows/:flowId/export?version=<n|draft>` (required query) and
  `POST /projects/:projectId/flows/import` (text body; parsers for `application/yaml`/`text/yaml`
  scoped to the flows module). File name via `nodeSlug` → `<slug>.forja.yaml`.

## Tasks

- [x] 1. Test + implement round trip of both #22 factories through `flowToYaml`/`yamlToFlow` — `src/server/flows/flow_yaml.ts`, `flow_yaml.test.ts`
- [x] 2. Test + implement determinism: same graph with nodes/groups/edges shuffled gives identical text; positions rounded
- [x] 3. Test + implement multiline prompts as literal `|` blocks
- [x] 4. Test + implement unknown `forja` version error
- [x] 5. Test + implement broken YAML error with line/column, and invalid graph content error with paths
- [x] 6. Refactor `flow_yaml.ts` for readability
- [x] 7. Test + implement `GET /api/flows/:flowId/export` (draft and published version, headers) — `flow_service.ts`, `flows_routes.ts`, `flows_routes.test.ts`
- [x] 8. Test + implement `POST /api/projects/:projectId/flows/import` (creates flow with draft = imported graph; 422 with position on broken YAML)
- [ ] 9. Self-review checklist (section 5) and feedback loops (section 6)
