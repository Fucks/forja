# Issue #61: Aplicar perfil de ferramentas por nó: MCP, CodeGraph e permissões

## Decisions

- `materializeToolProfile` (pure, contract from the issue) lives in
  `src/integrations/agent_runtime/tool_profile_materializer.ts`. Same file exports
  `credentialIdsReferencedBy(profile)` (to reveal credentials up front) and
  `workspaceSetupCommands(profiles, hasPackageJson)` (union, deduped by command).
- Setup commands of a profile: `npm i` when the repo has `package.json`, then `codegraph init --yes`
  when `indexCodegraphOnStart`.
- Tool rules go one per argv entry after the flag (`--disallowedTools Write Edit NotebookEdit`): rules
  may contain spaces (`Bash(git log *)`). `toolArgs` are the last argv entries, so the variadic flags
  swallow nothing else.
- `${cred:<id>}` in an MCP env value becomes `${<credential envVar>}` in the file; the value goes in
  `env`. A reference to an unknown credential throws `UnknownCredentialError`.
- The `${cred:...}` regex moves to `src/shared/tool_profile_types.ts` (`CREDENTIAL_REFERENCE`) and is
  reused by `tool_profile_service.ts`.
- Runtime contract (`agent_runtime.ts`): `RuntimeDir { host; container }`, `RuntimeFile`
  (= `mcpConfigFile` shape), `AgentRunRequest.runtimeFiles: RuntimeFile[]` (the runtime writes them in
  the runtime dir before running claude, never in the worktree), `Workspace.runtimeDir`,
  `AgentRuntime.headlessRuntimeDir(runId, nodeRunId)` (headless nodes, e.g. the TL, need the empty
  MCP file too).
- Docker: runtime dir = `paths.runtime/<containerName>` (new `ForjaPaths.runtime` = `~/.forja/runtime`),
  mounted read-only at `/home/agent/.forja`; created at open / headless start, removed at close / end.
- Server: `src/server/runtime/run_tool_profiles.ts` loads, once per run, the profiles of every agent
  node (node `toolProfileId` ?? project default), reveals the credentials they reference and checks
  `package.json` in `project.repoPath`. Exposes `RunToolProfiles` (`profileOf`, `credentialEnv`,
  `hasPackageJson`, `workspaceSetupCommands`). New `ExecutorDeps`: `toolProfiles`, `credentials`,
  `fileExists`. `NodeExecutionContext.toolProfiles: RunToolProfiles`.
- Workspace setup = profiles of agent nodes with `workspace: "item"`; passed via
  `buildWorkspaceSpec(place, item, setupCommands)`.

## Tasks

- [x] 1. Test+impl: CodeGraph preset → `--mcp-config <file> --strict-mcp-config --allowedTools mcp__codegraph__*`, file with `codegraph` server, setup `codegraph init --yes` — `tool_profile_materializer(.test).ts`
- [x] 2. Test+impl: read-only preset → empty `{ "mcpServers": {} }` file, `--disallowedTools Write Edit NotebookEdit`, no `--allowedTools`; `npm i` setup when `hasPackageJson`
- [x] 3. Test+impl: MCP env with `${cred:<id>}` → `${VAR}` in file, value in `env`; unknown credential throws; `credentialIdsReferencedBy`; move regex to shared
- [x] 4. Test+impl: `workspaceSetupCommands` unions and dedupes
- [x] 5. Runtime contract types + `ForjaPaths.runtime`; FakeAgentRuntime records requests/specs and runtime files
- [x] 6. Docker: runtime dir created, mounted read-only and removed on close; runtime files written there before the run (workspace and headless) — `docker_agent_runtime(.test).ts`
- [x] 7. Server: `run_tool_profiles.ts` + ExecutorDeps wiring (executor, active_run, node_run_execution, app_executor, test bed, context factory)
- [x] 8. Agent executor uses the node profile (`toolArgs`, `permissionMode`, `env`, `runtimeFiles`) — test in `executor.test.ts`: two nodes of an item get different `toolArgs`
- [x] 9. Workspace setup from the item's agent node profiles — test in `executor.test.ts`
- [x] 10. Self-review checklist and feedback loops
