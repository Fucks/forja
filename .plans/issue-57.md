# Issue #57: Adaptador Claude Code: executar nó agente no container

## Decisions

- The first parameter of `RunAgentInContainer` stays the existing `AgentContainer` (from #55:
  `containerId`, `containers`, `env`) instead of the issue's `ws` shape; it gains an optional
  `commits?: WorkspaceCommits` (absent for headless runs → `commits: []`).
- `WorkspaceCommits` (`readHead`, `listCommitsSince`) runs `git rev-parse HEAD` / `git rev-list --reverse
  <sha>..HEAD` on the host in the worktree — `src/integrations/agent_runtime/workspace_commits.ts`.
- `createRunAgentInContainer({ clock })` returns the `RunAgentInContainer`. Timeouts use the injected
  `Clock` (not `AbortSignal.timeout`) so FakeClock tests can trigger them — `run_deadlines.ts`.
- One iteration (exec + parser + failure mapping) lives in `claude_iteration.ts`; error mapping in
  `agent_failure.ts`. Keeps `run_agent_in_container.ts` as the readable loop.
- `--append-system-prompt` is not emitted: the request has no system prompt (the executor already
  appends the project conventions to the prompt).
- `--json-schema` goes on the iteration that may be the last: always without `completionSignal`
  (the loop only repeats on `error_max_turns`), only on iteration `maxIterations` with it.
- `error_max_turns` is recoverable: with `completionSignal` the loop goes on; without it, only when the
  iteration made no new commits. On the last iteration it is a normal failure.
- Prompt commands are expanded on every iteration (they reflect the current branch), via
  `sh -c <cmd>` in the container with the workspace env.
- `jsonSchemaToZod` is our own small converter (zod's `fromJSONSchema` is "semi-experimental").
- `DockerAgentRuntimeDeps.runAgentInContainer` becomes optional, defaulting to the Claude Code
  adapter; `runAgentNotImplemented` is deleted.
- `FakeContainerManager` (`src/test/fakes/fake_container_manager.ts`) replays scripted lines with
  FakeClock delays.
- Executor maps `maxTurns`, `maxBudgetUsd`, `expandPromptCommands` from the config; `toolArgs: []`
  until #61.

## Tasks

- [x] 1. `AgentRunRequest` gains `maxTurns?`, `maxBudgetUsd?`, `toolArgs`, `expandPromptCommands`; executor and test helpers fill them — `agent_runtime.ts`, `agent_executor.ts`
- [ ] 2. Test + implement `buildClaudeArgs` base flags (stream-json, model, effort, permission mode, no prompt) — `claude_command.ts`
- [ ] 3. Test + implement optional flags (max turns, budget, json schema, tool args, resume) — `claude_command.ts`
- [ ] 4. Test + implement `expandPromptCommands` substitution and failure text — `prompt_commands.ts`
- [ ] 5. Test + implement: commands inside fenced code blocks are kept — `prompt_commands.ts`
- [ ] 6. Test + implement `jsonSchemaToZod` (primitives, enum, object, required, array) — `output_schema.ts`
- [ ] 7. `FakeContainerManager` with FakeClock delays — `src/test/fakes/fake_container_manager.ts`
- [ ] 8. Test + implement single iteration: events in order, summary, usage, sessionId, prompt on stdin — `run_agent_in_container.ts`, `claude_iteration.ts`, `run_deadlines.ts`
- [ ] 9. Test + implement structured output validation (`output` / `StructuredOutputError`)
- [ ] 10. Test + implement iterations with `completionSignal` (stop on signal, usage sums, iteration note)
- [ ] 11. Test + implement commits (`WorkspaceCommits`) and the no-signal `error_max_turns` repeat — `workspace_commits.ts`
- [ ] 12. Test + implement failure mapping (usage limit, budget, generic) — `agent_failure.ts`
- [ ] 13. Test + implement idle/total timeouts and user cancel
- [ ] 14. Test + implement prompt command expansion in the runner (`expandPromptCommands` flag)
- [ ] 15. Wire the adapter into `DockerAgentRuntime` (default runner, commits, remove `runAgentNotImplemented`)
- [ ] 16. Self-review checklist (section 5) and feedback loops (section 6)
