# Issue #84: E2E do ciclo central com Playwright

## Decisions

- `playwright.config.ts` starts the server with `webServer.env` (`FORJA_DATA_DIR`, `FORJA_AGENT_RUNTIME=fake`,
  `FORJA_PORT=4399`) instead of a shell prefix, so the command also runs on Windows; the command is
  `npm run build && node dist/cli.js --no-open`. The data dir is a fresh `mkdtemp`, kept in an env var so
  the workers (which reload the config) see the same one. One worker: the scenarios share the server.
- Preconditions (credential for the simulated agents, `minStartIntervalMs: 0`, a published flow adapted
  to local items, the gate flow) go through the REST API in `e2e/fixtures.ts`; the steps each scenario
  describes go through the UI with `getByRole`/`getByLabel`.
- Each test gets its own temporary git repo (one commit + `refs/remotes/origin/main`, like the demo repo)
  and its own project, so the scenarios are independent.
- The simulated runtime creates no branches, so the fixture creates the item branches in the repo
  (the git node compares each item branch with `origin/main`), as the demo does.
- Reuse the demo's local-items adaptation: move `adaptToLocalItems` from `src/server/demo/demo_flow.ts`
  to `src/server/demo/local_items_flow.ts` as `adaptFlowToLocalItems` (exported) and import it in the fixtures.
  The gate flow reuses `createTemplateNode`, `buildMapGroup`, `placeInGroup`, `buildOutput`, `connect`.
- ESLint also lints `e2e/**/*.ts` and `playwright.config.ts` (type-checked, snake_case files), without
  the React hooks rules (Playwright's fixture `use` is not a hook).
- Local runs in this sandbox need `PLAYWRIGHT_BROWSERS_PATH=/tmp/pw` (chromium installed there).

## Tasks

- [x] 1. Refactor: extract `adaptFlowToLocalItems` to `src/server/demo/local_items_flow.ts`, used by `demo_flow.ts`
- [x] 2. Playwright config with `webServer`, `test:e2e` script, ESLint for `e2e/` — `playwright.config.ts`, `package.json`, `eslint.config.mjs`, `.gitignore`
- [x] 3. Fixtures: temporary git repo with one commit and the Forja API helpers — `e2e/fixtures.ts`
- [x] 4. Scenario project_and_flow: register repo, flow from "Fábrica básica", Dev effort `max`, map concurrency 2, publish v1 — `e2e/project_and_flow.spec.ts`
- [x] 5. Scenario live_run: 3 local items, start run, Dev "Rodando" + group counters, drawer with logs, "Sucesso" — `e2e/live_run.spec.ts`
- [x] 6. Scenario board: cards move and end in "Concluído"; drag a new item to the trigger column starts a run — `e2e/board.spec.ts`
- [x] 7. Scenario approvals: flow with a gate, approve with a comment, the flow goes on — `e2e/approvals.spec.ts`
- [ ] 8. CI job `e2e` (ubuntu, `needs: checks`, report artifact on failure) — `.github/workflows/ci.yml`
- [ ] 9. Self-review checklist and feedback loops (typecheck, lint, test, test:e2e)
