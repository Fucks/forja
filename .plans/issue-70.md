# Issue #70: Nó source: buscar itens respeitando dependências

## Decisions

- `selectSourceItems` (pure, contract from the issue) lives in `select_source_items.ts`. Each candidate gets the
  first reason that applies, in this order: `closed`, `label` (only without `requestedIds`), `blocked` (only with
  `skipBlocked`), `in_other_run`, `has_open_pr`; the eligible ones are sorted (issue number ascending, local items
  by `createdAt`) and cut at `limit` (the rest get `limit`).
- `requestedIds` = ids of `context.runItems`; an empty run passes `undefined` (= all items of the provider).
- Blocking reuses `isBlockedByOpenItem`, exported from `work_item_service.ts` (the same rule as `isBlocked`).
- The source needs services the `NodeExecutionContext` doesn't carry, so `createSourceExecutor(deps)` returns a
  `NodeExecutor`; `node_executors.ts` gets `createNodeExecutors(deps)` = the deps-free `nodeExecutors` + `source`.
  `createAppExecutor` passes it; the test bed keeps its stub for `source` (it has no work items in the database).
- `SourceExecutorDeps`: `workItems: WorkItemService`, `runs: RunRepository`, `projects: ProjectService`, `clock: Clock` (both for `syncGithubIssues`),
  `githubOf(projectId): Promise<GitHubProvider>`.
- Items in other active runs: `run.itemIds` + `workItemId` of the NodeRuns of the other active runs of the project.
- Items with an open PR: new `RunRepository.listItemIdsWithArtifact(projectId, kind)` gives the items with a
  `pr_url` artifact; for each candidate among them, `github.findPullRequestByHead(repo, item.branch)` decides if
  it is still `open`. Projects without `githubRepo` have none.
- GitHub provider: `syncGithubIssues` before loading, with `{ label }`; a sync error fails the node
  (`GithubSyncFailedError`) instead of selecting from stale items.
- The provider per project (`resolveGithubEnv` + `createGhCliGitHubProvider`) is extracted from
  `project_github_sync.ts` into `src/server/work_items/project_github_provider.ts`, reused by the executor.
- Artifact: `{ name: "source_selection", kind: "json", value: { selectedIds, excluded } }`.

## Tasks

- [x] 1. Test + impl: excludes closed items (`closed`) — `select_source_items.ts`, `source_executor.test.ts`
- [x] 2. Test + impl: excludes items without the label (`label`)
- [x] 3. Test + impl: excludes items blocked by an open item when `skipBlocked` (`blocked`), keeps them otherwise
- [x] 4. Test + impl: excludes items in other active runs (`in_other_run`) and with open PR (`has_open_pr`)
- [x] 5. Test + impl: sorts by issue number / local `createdAt` and cuts at `limit` (`limit`)
- [x] 6. Test + impl: starts from `requestedIds` (no label filter, still drops blocked)
- [x] 7. Test + impl: `RunRepository.listItemIdsWithArtifact` (sqlite + in-memory) — `sqlite_run_repository.test.ts`
- [x] 8. Test + impl: executor with local provider outputs snapshots and the `source_selection` artifact — `source_executor.ts`
- [x] 9. Test + impl: executor excludes items of other active runs of the project
- [x] 10. Test + impl: executor syncs GitHub before selecting; closing the blocker releases the item next run
- [x] 11. Test + impl: executor fails when the GitHub sync fails
- [x] 12. Test + impl: executor excludes items with an open PR from an earlier run (`FakeGitHubProvider`)
- [x] 13. Test + impl: executor starts from the run's items
- [ ] 14. Extract `project_github_provider.ts` and reuse it in `project_github_sync.ts`
- [ ] 15. Register: `createNodeExecutors` in `node_executors.ts`, wired in `app_executor.ts`, `main.ts`, `test_app_deps.ts`
- [ ] 16. Self-review checklist and feedback loops
