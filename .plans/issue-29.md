# Issue #29: Templates de fluxo embutidos

## Decisions

- Templates live in `src/server/flows/templates/`. Shared canvas helpers (320 px columns, map/loop group
  frames, typed `createDefaultNode`) go in `template_layout.ts`; shared node builders (trigger, Sandcastle
  source, TL/Dev/Reviewer agents, open PR, outputs, `connect`) in `template_nodes.ts` (extra files).
- `basic_factory` mirrors `buildCanonicalFlow()` from `src/test/factories/flow_graph_factory.ts` (same node
  ids, edges, groups and configs); the test compares the structure, not the positions or prompts.
- Tool profile ids come from `CODEGRAPH_PRESET_ID` / `READONLY_PRESET_ID` (`tool_profile_presets.ts`).
- `loadPrompt(name)` reads `runtimeAssetPath("prompts", "flows", "templates", "prompts", `${name}.md`)`
  (tsup already copies `**/prompts/*.md`). Template-specific inputs (`{{inputs.spec}}`, `{{inputs.tests}}`)
  are appended to the shared prompts with `appendPromptSection`, so one `developer.md`/`reviewer.md` serves
  both templates.
- Prompts stay in English like `.sandcastle/*-prompt.md`; template names/descriptions are PT-BR.
- Agents only output `{ result, summary }` and `renderPrompt` throws on undefined variables, so the loop Dev
  prompt does not use `{{inputs.notes}}` (empty on iteration 1). The reviewer records its notes in a commit
  (`RALPH: review notes for #N`) that the Dev sees through the `git log` context command.
  `carry: ["notes"]` stays as in the contract.
- Ordering-only optional inputs (edges are the only ordering): `tests.changes` ← `dev.summary` and the
  done `output.pullRequest` ← `open_pr.result`, so tests wait for the Dev and exhausted items never go
  to done.
- Loop `until` path is `revisar.result.approved` (`nodeSlug("Revisar")` + the agent `result` port).
- API: `GET /api/flow-templates` → `FlowTemplateSummary[]` (`id`, `name`, `description`);
  `POST /api/projects/:projectId/flows/from-template` `{ templateId, name }` → 201 `FlowSummary`; unknown
  template → 404 (`NotFoundError`). Input schema + summary type in `src/shared/flow_types.ts` (extra file).

## Tasks

- [x] 1. Prompts `tl_spec.md`, `developer.md`, `reviewer.md` and `loadPrompt`/`appendPromptSection` —
      `src/server/flows/templates/prompts/*.md`, `load_prompt.ts`
- [x] 2. Test: "Fábrica básica" is publishable and has the canonical structure (concurrency 1/3/1) —
      `flow_templates.test.ts`
- [x] 3. Implement `template_layout.ts` and `basic_factory.ts`
- [x] 4. Test: "Dev ↔ Review em loop" is publishable, loop max 3, `exhausted` → needs_human, map concurrency 2
- [x] 5. Implement `review_loop.ts`
- [x] 6. Test + implement `FLOW_TEMPLATES` / `findFlowTemplate` in `flow_template_registry.ts`
      (every template valid with `checkPromptVariables`, unique ids)
- [ ] 7. Test + implement `GET /api/flow-templates` — `flows_routes.ts`, `flow_types.ts`
- [ ] 8. Test + implement `POST /api/projects/:projectId/flows/from-template` (creates a draft that publishes;
      404 for unknown template)
- [ ] 9. Self-review checklist (section 5) and feedback loops (section 6)
