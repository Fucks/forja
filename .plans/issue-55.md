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
- `AgentContainer`, `RunAgentInContainer` and the `runAgentNotImplemented` stub live in `agent_container.ts`
  (#57 implements it). `FakeCommandRunner.when` accepts an args predicate (random exec markers).
- Runtime split: `workspace_layout.ts` (ids, labels, mounts, Windows paths), `workspace_files.ts`,
  `workspace_setup.ts`, `docker_workspace.ts` (the `Workspace` object), `docker_agent_runtime.ts` (factory).
- `writeFiles` writes on the host worktree and rejects paths that escape it (`WorkspaceError`).
- Orphan `closeWorkspace(id)` (not in memory) removes containers found by label; orphan worktrees are #87.
- Windows: `toContainerPath` maps `C:\x` → `/c/x` for the git common dir mount and emits a `system` event.

## Tasks

- [x] 1. Streaming lines in `CommandOptions`, `FakeCommandRunner` replay + test, `ExecaCommandRunner` generators
- [x] 2. `ForjaPaths.worktrees` — `src/lib/paths.ts`, `paths.test.ts`
- [x] 3. `Workspace.root` + `Workspace.writeFiles` contract; in-memory `writeFiles` in `FakeAgentRuntime` + test
- [x] 4. Test+impl: `WorktreeManager.ensure` creates from existing branch / new from origin base / fallback base / reuses registered path / throws `WorkspaceError` — `worktree_manager.ts`
- [x] 5. Test+impl: `WorktreeManager.remove` (remove --force + prune; idempotent)
- [x] 6. Test+impl: `ContainerManager.start` exact args (mounts ro, labels, user, network, workdir) and failure
- [x] 7. Test+impl: `ContainerManager.exec` env names only in argv, values in env, stdin, streaming, tails
- [x] 8. Test+impl: `ContainerManager.exec` abort/timeout kills via pkill marker
- [x] 9. Test+impl: `ContainerManager.stop` idempotent, `list` by labels
- [x] 10. Test+impl: `openWorkspace` worktree + container with documented mounts/labels/user — `docker_agent_runtime.ts`
- [x] 11. Test+impl: setup writes `spec.files`, runs setup commands emitting `system` events; failure removes container and throws `WorkspaceError`
- [x] 12. Test+impl: workspace `exec`, `diff` (truncated 200 KB), `writeFiles` (rejects escaping paths)
- [x] 13. Test+impl: `close` / `closeWorkspace` (keeps branch, idempotent, orphans by label), `listOpenWorkspaces` from Docker
- [x] 14. Test+impl: `runHeadless` ephemeral read-only container, removed at the end
- [ ] 15. Integration test `docker_agent_runtime.integration.test.ts` (skipIf !FORJA_IT_DOCKER)
- [ ] 16. Self-review checklist and feedback loops
