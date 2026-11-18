# Issue #198: Ajustes de Fonte, Gatilho, Aprovação, Git, Saída, Map e Loop (e corrigir o corpo do PR)

## Decisions

- `git_body_source_missing` lives in `src/engine/validation_rules/git_rules.ts` and is registered in
  `VALIDATION_RULES` of `src/engine/graph_validation.ts` (that is where every rule is registered;
  `validation_issues.ts` only has the issue builders). It exports `findGitBodySourceProblems(graph)`
  for the registry and `checkGitBodySource(graph, gitNode)` for the Git inspector, which shows the warning
  below the `DataPicker`.
- `inputs.<port>…` is missing when the port is not an input of the node or has no edge into it;
  `nodes.<slug>…` is missing when no upstream node (`listUpstreamNodes`) has that slug. Other roots
  (`item`, `run`, `project`) are not checked.
- Templates write `bodyFrom: "inputs.body"` (`template_nodes.ts`); the canonical test flow does too.
  The v1 migration test keeps `inputs.summary` (that is the migration's job, the warning flags it).
- `previewSourceItems(projectId, sourceConfig)` is created by `createSourcePreview(deps)` with
  `{ projects, workItems, githubOf }`. GitHub: `listIssues` + `getIssue` for blockers outside the
  listing, never `syncGithubIssues` (it writes). Local: `workItems.list`. Both go through
  `selectSourceItems`, made generic over a `SourceCandidate` (the `WorkItem` fields it reads);
  `isBlockedByOpenItem` gets the narrower parameter types. `skipped` counts the `blocked` exclusions.
- A `GitHubError` or a project without repo becomes `SourcePreviewFailedError` (a
  `DomainValidationError`, 422) with a message safe for users; the dialog adds
  "Verifique a credencial do GitHub em Configurações".
- Route types (`sourcePreviewInput`, `SourcePreview`) in `src/shared/api_types.ts`.
- The triggers page has no query-string filter, so the Gatilho only links to `/projects/:id/triggers`
  ("Configurar em Gatilhos"). Trigger kind becomes `OptionCardsField` over `TRIGGER_KINDS`;
  `TRIGGER_KIND_LABELS` becomes unused and is deleted.

## Tasks

- [x] 1. Test + rule `git_body_source_missing` (inputs port missing, port without edge, node not before) —
      `graph_validation.test.ts`, `git_rules.ts`, `graph_validation.ts`
- [x] 2. Templates and canonical factory use `bodyFrom: "inputs.body"` — `template_nodes.ts`,
      `flow_graph_factory.ts`
- [x] 3. Test: a PR opened by `basic_factory` with the fake runtime has the Reviewer summary as body —
      `flow_templates.test.ts`
- [x] 4. Make `selectSourceItems` generic over `SourceCandidate` — `select_source_items.ts`,
      `work_item_service.ts`
- [x] 5. Test + `previewSourceItems` (GitHub fake with blocked and free issues, provider error, local, no
      run/item written) — `source_preview.ts`, `source_preview.test.ts`
- [x] 6. Test + route `POST /api/projects/:projectId/flows/:flowId/source-preview` with route types —
      `flows_routes.ts`, `flows_routes.test.ts`, `api_types.ts`
- [x] 7. Git inspector: `bodyFrom` as `DataPicker` (text fields first) with the warning — `git_inspector.tsx`,
      `other_inspectors.test.tsx`
- [x] 8. Fonte: "Ver o que seria buscado agora" dialog (loading, empty, error, list, skipped) and
      `skipBlocked` example — `source_preview_dialog.tsx`, `source_inspector.tsx`, tests
- [x] 9. Gatilho: cards for the 5 kinds and link "Configurar em Gatilhos" — `trigger_inspector.tsx`, tests
- [ ] 10. Aprovação: `show` as described checkboxes and `gate_preview` skeleton — `gate_inspector.tsx`,
      `gate_preview.tsx`, tests
- [ ] 11. Saída: explanation of the comment and the reason — `output_inspector.tsx`, tests
- [ ] 12. Map: concurrency explanation with the example — `group_inspector.tsx`, tests
- [ ] 13. Loop: friendly carry labels and `exhausted` diagram with the hint — `loop_fields.tsx`,
      `loop_exhausted_diagram.tsx`, tests
- [ ] 14. Docs touched by the changes regenerated (`npm run docs:nodes`)
- [ ] 15. Self-review checklist (section 5) and feedback loops (section 6)
