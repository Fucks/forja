# Issue #79: Nó git: rebase, push e abertura de PR

## Decisions

- `GitProvider` gains `push(root, branch, env)` (always `--force-with-lease`, never `--force`) and
  `aheadBehind(root, branch, base)` (`git rev-list --left-right --count base...branch`); failures
  throw `GitCommandError` (in `git_provider.ts`).
- The executor is `createGitExecutor({ git, githubOf })` in `git_executor.ts`; `createNodeExecutors`
  takes `SourceExecutorDeps & GitExecutorDeps` and `app_executor.ts` passes its `git`.
- Base branch = `config.baseBranch ?? project.baseBranch`; the remote ref is `origin/<base>`.
- Push and open_pr run on the host in `project.repoPath` (worktrees share the refs) with
  `buildAgentEnv({ github: credentials.githubToken })` as env.
- `open_pr` always pushes first (pushing an up-to-date branch is a no-op); no commits ahead →
  `{ branch, pushed: false }` and no PR. An open PR for the head is reused: the body is posted as a
  comment on it (`GitHubProvider.comment`; PRs are issues on GitHub, the fake accepts PR numbers).
- Body = `inputs[bodyFrom]` when it is a string, else a default summary; then `Closes #N` when the
  item has a number (GitHub issue), then `🤖 Gerado pela Forja`.
- The rebaser is a synthetic agent node (`buildRebaserNode` in `executors/rebaser_node.ts`) run with
  `executeAgentNode`: project default model/effort/credential/tool profile, `maxIterations` 20,
  completion signal `<promise>COMPLETE</promise>`, prompt from `executors/prompts/rebase.md`
  (variables `item.title`, `item.branch`, `project.baseBranch`; the context's baseBranch is the
  resolved base). `nodesThatRunAgents(graph)` (same file) adds the rebasers to the agent nodes so
  `loadRunCredentials` and `loadRunToolProfiles` load their credential and profile.
- The base branch goes into the workspace shell command quoted by `quoteShellArgument`
  (`src/lib/shell_quote.ts`).

## Tasks

- [x] 1. `CliGitProvider.aheadBehind` counts commits ahead/behind — `cli_git_provider.ts`, `git_provider.ts`, test
- [x] 2. `CliGitProvider.push` uses `--force-with-lease` with the env and throws `GitCommandError` on failure — same files
- [x] 3. `FakeGitProvider` records pushes and answers `aheadBehind` from scripted counts — `fake_git_provider.ts`
- [x] 4. `FakeGitHubProvider.comment` accepts pull request numbers — `fake_github_provider.ts`, test
- [ ] 5. Rebaser prompt adapted from `.sandcastle/rebase-prompt.md` — `executors/prompts/rebase.md`
- [ ] 6. `buildRebaserNode` + `nodesThatRunAgents`, used by `loadRunCredentials` and `loadRunToolProfiles` — `rebaser_node.ts`, test
- [ ] 7. Test + impl: rebase without conflicts does not call the agent and outputs `{ branch, pushed: false }` — `git_executor.ts`, `git_executor.test.ts`, `src/lib/shell_quote.ts`
- [ ] 8. Test + impl: rebase with conflict runs the rebaser agent (prompt, maxIterations 20) — same
- [ ] 9. Test + impl: conflicts left or rebase unfinished fail with "conflitos não resolvidos" — same
- [ ] 10. Test + impl: push uses `--force-with-lease` with GH_TOKEN and records the `branch` artifact — same
- [ ] 11. Test + impl: push without commits ahead does not push — same
- [ ] 12. Test + impl: open_pr creates the PR (prTitle, body with `Closes #N` and signature, draft) and records `pr_url` — same + `pr_title.ts`
- [ ] 13. Test + impl: open_pr reuses the open PR and comments the body — same
- [ ] 14. Test + impl: open_pr without commits ahead opens no PR; project without GitHub repo fails clearly — same
- [ ] 15. Register the git executor — `node_executors.ts`, `app_executor.ts`
- [ ] 16. Self-review checklist and feedback loops (typecheck, lint, test)
