# Issue #200: E2E: montar um fluxo com Decisão, Comando e Loop só pela interface

## Decisions

- Run the E2E locally with `PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright npm run test:e2e`
  (`npx playwright install chromium-headless-shell` once with that variable set).
- `ForjaApi.openSession(request)` loads `/` first: the API needs the session cookie the web app
  hands out (the API-driven specs failed with 401 without it). `board.spec.ts` still fails on its
  keyboard drag on `development`; it is not part of this issue.
- Scripted Reviewer verdicts: `ScriptedAgentOutputs` (in `src/integrations/agent_runtime/`) holds
  rules `{ promptIncludes, outputs }`; each matching run takes the next output, the last repeats;
  with no rule the runtime keeps answering the minimal value of the schema (`approved: false`).
  Only with `FORJA_AGENT_RUNTIME=fake`, `PUT /api/scripted-agents/outputs` replaces the rules;
  `AppDeps.scriptedAgentOutputs` is optional and set by `main.ts`.
- GitHub fake: `e2e/fake_github/gh`, an executable Node script first on the PATH of the web server
  (answers `pr list`, `pr create`, `pr view`, `issue list`). The repo of the fixture has
  `origin` = a GitHub URL (so the project gets `githubRepo`) and a local bare repo as `pushurl`;
  each item branch gets one commit ahead, so the Git node pushes and opens the PR.
- The canvas gets accessible port handles (`aria-label` "Entrada X" / "Saída X") and the Loop group
  gets its `exhausted` handle ("Esgotou as voltas"): the validation already accepts that edge, but
  the canvas had no handle to drag it from.
- Through the UI only agents can gain input ports, so Comando, Git and the "Concluído" Saída are
  ordered by Decisão nodes (outputs of type any): Reviewer.result → "Aprovado?" → Comando;
  Comando.output → Git "Texto do PR"; Git.result → "PR aberto?" → Saída "Concluído".
  The Loop goes back through Reviewer.summary → Dev.context.
- Page object `e2e/pages/flow_editor_page.ts` with the contract methods (`addFromPalette`,
  `connect`, `dropEdgeOnEmpty`, `openInspector`, `pickData`, `chooseOption`, `applyPreset`);
  `chooseLinkedNode` picks from the "adicionar a partir da porta" menu.

## Tasks

- [x] 1. Test + impl: `ScriptedAgentOutputs` gives the scripted outputs in order, repeats the last, nothing without a rule — `scripted_agent_outputs.ts`
- [x] 2. Test + impl: the scripted runtime answers a matching prompt with the scripted output — `scripted_agent_run.ts`, `scripted_agent_runtime.ts`
- [x] 3. Test + impl: `PUT /api/scripted-agents/outputs` replaces the rules, only with the fake runtime — `scripted_agent_routes.ts`, `route_modules.ts`, `app.ts`, `main.ts`
- [ ] 4. Test + impl: port handles have accessible names — `port_handle.tsx`
- [ ] 5. Test + impl: the Loop group shows its "Esgotou as voltas" handle — `group_node.tsx`
- [ ] 6. E2E infra: session cookie, `gh` shim on the web server PATH, review project fixture — `forja_api.ts`, `fixtures.ts`, `e2e/fake_github/gh`, `playwright.config.ts`
- [ ] 7. Page object `flow_editor_page.ts`
- [ ] 8. E2E scenario: Reviewer rejects then approves → Dev twice, tests pass, PR opened, "Concluído" — `flow_authoring.spec.ts`
- [ ] 9. E2E scenario: Reviewer always rejects → exhausted → "Precisa de humano" — `flow_authoring.spec.ts`
- [ ] 10. Self-review checklist (section 5) and feedback loops (section 6)
