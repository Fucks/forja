# Issue #83: Template Pipeline Sandcastle de ponta a ponta

## Decisions

- Template lives in `src/server/flows/templates/sandcastle_pipeline.ts` (id `sandcastle_pipeline`, name
  "Pipeline Sandcastle"), registered last in `FLOW_TEMPLATES`. Reuses `buildManualTrigger`,
  `buildSandcastleIssuesSource` (+ `limit: 10`), `buildOpenPullRequest`, `buildDoneOutput`,
  `connectPullRequestToDoneOutput`, `buildOutput`, `buildMapGroup`, `createTemplateNode`, `loadPrompt`.
- Prompts copied from `.sandcastle/*.md` into `src/server/flows/templates/prompts/sandcastle_{implement,review,evidence}.md`
  with the variable swaps of the issue; `TemplatePromptName` gains the three names. Plan is replaced by the
  source, rebase by the built-in git rebase node (its own rebaser prompt), so no plan/rebase prompt files.
  The evidence prompt returns `{ checksPassed, failureSummary?, body }` as structured output instead of
  writing `body.md`/`result.json`.
- A condition node evaluates its path against the value on its `value` input, so "Fez commits?" receives
  `implementer.result` and tests `commits > 0`; "Checks passaram?" receives `evidence.result` and tests
  `checksPassed == true`.
- Ordering between nodes goes through explicit optional ports (edges are the only ordering), typed `json`.
- `agent_executor`: when the node has no `outputSchema`, `result` is `{ commits: <count of new commits> }`.
- `git_executor`: `bodyFrom` is a path into the inputs (`lookUpPath`), so `"evidence.body"` reads the body
  of the evidence result arriving on the `evidence` port; a plain port name still works.
- `output_executor`: `failureSummary` is a reason too, so the issue comment of "Precisa de humano" carries
  the summary of the failed checks. Needs-human outputs of this template comment on the issue.
- E2E test uses `ExecutorTestBed` with a new `github` option: real source, git and output executors over a
  `FakeGitHubProvider`, the bed's `FakeGitProvider` and a project with a GitHub repo.
- No README existed: create `README.md` with the "Migrando do `.sandcastle/main.mts`" section.

## Tasks

- [x] 1. Test: agent without output schema reports `{ commits: N }` as its result — `src/server/runtime/executor.test.ts`
- [x] 2. Implement commit count in `executeAgentNode` — `src/server/runtime/executors/agent_executor.ts`
- [ ] 3. Test: `bodyFrom` reads a path inside an input — `src/server/runtime/executors/git_executor.test.ts`
- [ ] 4. Implement `bodyFrom` as a path — `src/server/runtime/executors/git_executor.ts`
- [ ] 5. Test: the needs-human comment uses `failureSummary` as reason — `src/server/runtime/executors/deterministic_executors.test.ts` (or output tests)
- [ ] 6. Implement `failureSummary` reason — `src/server/runtime/executors/output_executor.ts`
- [ ] 7. Adapted prompts `sandcastle_implement.md`, `sandcastle_review.md`, `sandcastle_evidence.md` + `TemplatePromptName`
- [ ] 8. Test: template is listed and publishes without errors; structure (nodes, concurrency 1, configs) — `sandcastle_pipeline.test.ts`, `flow_templates.test.ts`
- [ ] 9. Implement the template and register it — `sandcastle_pipeline.ts`, `flow_template_registry.ts`
- [ ] 10. Test bed: `github` option with real source/git/output executors — `src/test/executor_test_bed.ts`
- [ ] 11. E2E test: unblocked item gets PR with evidence body and `Closes #N`; blocked item not in run; failed checks → needs human with failure summary — `sandcastle_pipeline.test.ts`
- [ ] 12. E2E test: implementer without commits → needs human — `sandcastle_pipeline.test.ts`
- [ ] 13. README section "Migrando do `.sandcastle/main.mts`" — `README.md`
- [ ] 14. Self-review checklist (section 5) and feedback loops (section 6)
