# Issue #71: Modo demo: runtime roteirizado e --seed-demo

## Decisions

- `DemoScript` (type) and `DEMO_SCRIPT` (texts, tool calls, summaries the simulated agents use) live in
  `src/server/demo/demo_script.ts`; `createScriptedAgentRuntime` defaults `script` to `DEMO_SCRIPT`.
- The runtime is production code: it does not reuse `src/test/fakes/*`. Randomness comes from a small
  seeded PRNG keyed by `nodeRunId`, so the same NodeRun always plays the same events, duration and usage.
- Duration of an agent run: 3–8 s divided by `speed` (default 1). Events are spread over the duration with
  `clock.setTimeout`; `request.signal` cancels with `AgentCanceledError`.
- The minimal valid value for an `outputSchema` (object → required properties, array → [], string "ok",
  number/integer 0, boolean true, enum → first value) is its own module
  `src/integrations/agent_runtime/minimal_schema_value.ts`; tests check it with `jsonSchemaToZod`.
- `completionSignal` of the request is echoed in the result, so a developer node finishes in one iteration.
- Workspaces are in memory: `exec` succeeds with no output, `diff` is empty, files are kept in a map.
- `seedDemo(deps: AppServices)`: `AppServices` is declared in `seed_demo.ts` as the app pieces the seed
  needs (`db`, `events`, `logs`, `git`, `commands`, `secrets`, `redactor`, `clock`). The seed builds its own
  executor with `createAppExecutor` and `createScriptedAgentRuntime({ clock, speed: 50 })`, so it works
  whichever runtime the server uses.
- Idempotency: `app_meta` keys `demo_seeded = "true"` and `demo_project_id = <id>`.
- The demo repo is a `mkdtemp` dir prepared through `CommandRunner`: `git init -b main`, an empty commit,
  `refs/remotes/origin/main` and a branch per demo item, so the `open_pr` node finds no commits ahead and
  finishes without GitHub. Tests use a `FakeCommandRunner` and a `FakeGitProvider` that knows any path.
- `git_executor` `open_pr`: only requires the project's GitHub repo when there are commits to push (outside
  the issue's file list, minimal change; the demo project has no GitHub remote).
- The seed creates a fictitious Claude credential and makes it the project's default credential (agents
  need one to run) and sets global `minStartIntervalMs` to 0 (the demo never calls the real Claude, and
  15 agents 5 s apart would exceed the 1 min target).
- Flow: "Fábrica básica" built from `basicFactoryTemplate`, source node switched to `provider: "local"`
  without label, agent prompts use `{{item.id}}` instead of `{{item.number}}` (local items have no
  number), published and set as the project's default flow (`demo_flow.ts`).
- The seed run is started with the ids of the 5 demo items: a run started without items does not give
  the NodeRuns of the groups their `item` (ActiveRun only knows `run.itemIds`) — pre-existing gap, report
  it in the issue comment, don't fix it here.
- Split: `seed_demo.ts` (orchestration, `AppServices`), `demo_git_repo.ts`, `demo_marker.ts`,
  `demo_flow.ts`, `demo_run.ts` (scripted executor + wait for the end), `DEMO_ITEMS` in `demo_script.ts`.

## Tasks

- [x] 1. Test + implement the minimal valid value for a JSON Schema — `minimal_schema_value.ts` (+ test)
- [x] 2. Test + implement a headless agent run that lasts 3–8 s / speed and emits text and tool calls
      (Read, Grep, Edit, Bash "npm run test") — `scripted_agent_runtime.ts`, `demo_script.ts`
- [x] 3. Test + implement determinism by `nodeRunId` (events, duration, usage)
- [x] 4. Test + implement the output that satisfies `outputSchema` and the echoed completion signal
- [x] 5. Test + implement the in-memory workspace (open, runAgent, exec, diff, writeFiles, list, close)
- [x] 6. Test + implement cancellation by the request signal
- [x] 7. Test + implement `open_pr` without commits ahead not requiring a GitHub repo — `git_executor.ts`
- [x] 8. Test + implement `seedDemo` creating project, 5 local items, published flow and a finished run
      with logs and usage — `seed_demo.ts`, `seed_demo.test.ts`
- [x] 9. Test + implement `seedDemo` idempotency (`app_meta.demo_seeded`)
- [ ] 10. Wire `main.ts`: `FORJA_AGENT_RUNTIME=fake` → scripted runtime; `options.seedDemo` → `seedDemo()`
      before listening; delete `UnavailableAgentRuntime` if unused
- [ ] 11. Manual check: `FORJA_DATA_DIR=<empty> FORJA_AGENT_RUNTIME=fake npm run start -- --no-open --seed-demo`
      boots with the demo; a second boot does not duplicate; a new run finishes in < 1 min
- [ ] 12. Self-review checklist and feedback loops (typecheck, lint, test)
