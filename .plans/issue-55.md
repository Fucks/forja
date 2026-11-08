# Issue #55: Runtime próprio: workspace por item com git worktree e container Docker

## Decisions

- `CommandOptions` (#17) gains optional `onStdoutLine` / `onStderrLine`; `ExecaCommandRunner` streams via execa
  line generators and `FakeCommandRunner` replays the scripted stdout/stderr lines. This is how
  `ContainerManager.exec` streams without leaving `CommandRunner`.
- `ForjaPaths` gains `worktrees` (`<root>/worktrees`); worktree dir = `worktrees/<projectId>/<branch with / → __>`.
- `WorktreeManager` (`createWorktreeManager(commands)`) reuses `CliGitProvider.branchExists`; detects reuse with
  `git worktree list --porcelain`; base fallback = try `origin/<base>`, then `<base>`. `remove` skips
  `git worktree remove` when the path is not registered (idempotent), always runs `prune`.
- `ContainerManager` (`createContainerManager(commands)`) is the only place that builds docker args.
  `exec` passes env as `-e NAME` and values in the runner `env`; each exec gets `FORJA_EXEC_ID=<uuid>`
  and runs inside a small `sh` wrapper whose argv carries the marker, so `pkill -f -- <marker>` reaches it
  and the wrapper forwards TERM to the command. Abort → kill + `AgentCanceledError`; timeout → kill +
  `AgentTimeoutError("total")`. `stop` treats "No such container" as success. `list` parses
  `--format {{.ID}}\t{{.Labels}}`.
- Workspace id = container name `forja-<last 8 of runId>-<last 8 of workItemId>` (lowercased, sanitized).
- `Workspace.exec(command: string)` keeps its string contract and runs `sh -c <command>` with the spec env.
- `RunAgentInContainer` type + `runAgentNotImplemented` stub live in `docker_agent_runtime.ts` (#57 replaces it).
- `writeFiles` writes on the host worktree and rejects paths that escape it (`WorkspaceError`).
- Orphan `closeWorkspace(id)` (not in memory) removes containers found by label; orphan worktrees are #87.
- Windows: `toContainerPath` maps `C:\x` → `/c/x` for the git common dir mount and emits a `system` event.

## Tasks

- [x] 1. Streaming lines in `CommandOptions`, `FakeCommandRunner` replay + test, `ExecaCommandRunner` generators
- [x] 2. `ForjaPaths.worktrees` — `src/lib/paths.ts`, `paths.test.ts`
- [x] 3. `Workspace.root` + `Workspace.writeFiles` contract; in-memory `writeFiles` in `FakeAgentRuntime` + test
- [ ] 4. Test+impl: `WorktreeManager.ensure` creates from existing branch / new from origin base / fallback base / reuses registered path / throws `WorkspaceError` — `worktree_manager.ts`
- [ ] 5. Test+impl: `WorktreeManager.remove` (remove --force + prune; idempotent)
- [ ] 6. Test+impl: `ContainerManager.start` exact args (mounts ro, labels, user, network, workdir) and failure
- [ ] 7. Test+impl: `ContainerManager.exec` env names only in argv, values in env, stdin, streaming, tails
- [ ] 8. Test+impl: `ContainerManager.exec` abort/timeout kills via pkill marker
- [ ] 9. Test+impl: `ContainerManager.stop` idempotent, `list` by labels
- [ ] 10. Test+impl: `openWorkspace` worktree + container with documented mounts/labels/user — `docker_agent_runtime.ts`
- [ ] 11. Test+impl: setup writes `spec.files`, runs setup commands emitting `system` events; failure removes container and throws `WorkspaceError`
- [ ] 12. Test+impl: workspace `exec`, `diff` (truncated 200 KB), `writeFiles` (rejects escaping paths)
- [ ] 13. Test+impl: `close` / `closeWorkspace` (keeps branch, idempotent, orphans by label), `listOpenWorkspaces` from Docker
- [ ] 14. Test+impl: `runHeadless` ephemeral read-only container, removed at the end
- [ ] 15. Integration test `docker_agent_runtime.integration.test.ts` (skipIf !FORJA_IT_DOCKER)
- [ ] 16. Self-review checklist and feedback loops
