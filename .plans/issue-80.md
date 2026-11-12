# Issue #80: Sincronizar PR mesclado: fechar issue, mover card e limpar branch

## Decisions

- `syncPullRequests` lives in `src/server/work_items/pull_request_sync.ts`; its deps follow the contract
  plus `clock: Clock` (needed for the 30-day window; `src/server/` must not call `Date.now()`).
- PR source: items listed by `runs.listItemIdsWithArtifact(projectId, "pr_url")`, then each item's
  `pr_url` artifacts created in the last 30 days (`listNodeRunsOfItem` + `listArtifacts`). The PR state
  comes from `github.findPullRequestByHead(repo, item.branch)`; it counts only when its url is one of
  those artifacts (a PR opened by Forja).
- Items already in the manual column "done" are skipped: that is what makes a repeated sync a no-op.
- Merged PR → `items.setManualColumn(id, "done")` (publishes `work_item.updated`), `closeIssue` only
  when `getIssue` says open (GitHub items), `git.deleteLocalBranch(project.repoPath, item.branch)`.
- `GitProvider.deleteLocalBranch(root, branch): Promise<boolean>` — false when there is no local
  branch; throws `BranchInUseError` (subclass of `GitCommandError`) when a worktree holds it; the sync
  ignores only that error. CLI uses `git branch -D` (squash merges are not "merged" for git).
- Job: the GitHub scheduler round in `project_github_sync.ts` syncs pull requests before issues (so the
  closed issue reaches the item in the same round); failures are logged, not thrown. Route
  `POST /api/projects/:projectId/pull-requests/sync` in `work_items_routes.ts`.
- `output` executor becomes `createOutputExecutor({ runs, githubOf })`, registered in
  `createNodeExecutors` and in the test bed. It comments only when `commentOnIssue`, the item has an
  issue number and the project a GitHub repo, and no earlier SUCCEEDED NodeRun of the same node, run
  and item exists (once per run, even after retries). Text: `Forja: run <runId> concluída — PR #N
  aberto.` / `... — item precisa de revisão humana (<motivo>).` / `Forja: run <runId> concluída.`
  The reason comes from a `reason`/`notes` string of the node inputs.

## Tasks

- [ ] 1. `deleteLocalBranch` + `BranchInUseError` in `git_provider.ts`, `cli_git_provider.ts` (+ test) and `fake_git_provider.ts`
- [ ] 2. Test + implement: merged PR moves the item to done, closes the open issue, deletes the branch — `pull_request_sync.ts`
- [ ] 3. Test + implement: closed-without-merge PR, PR not opened by Forja, PR older than 30 days change nothing
- [ ] 4. Test + implement: repeated sync does nothing more; already-closed issue is not closed again; local item has no issue to close
- [ ] 5. Test + implement: branch held by a worktree is kept and the rest still happens; project without GitHub repo syncs nothing
- [ ] 6. Job in `project_github_sync.ts` and route `POST /api/projects/:projectId/pull-requests/sync` — `work_items_routes.ts` (+ route test)
- [ ] 7. Test + implement: `output` with `commentOnIssue` comments on the issue once per run — `output_executor.ts`, `deterministic_executors.test.ts`, `node_executors.ts`, test bed
- [ ] 8. Self-review checklist and feedback loops
