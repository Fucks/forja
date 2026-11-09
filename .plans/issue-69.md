# Issue #69: Sincronizar issues do GitHub com os itens de trabalho

## Decisions

- `syncGithubIssues` reuses `WorkItemService.upsertFromGithub` (#50), which already resolves
  "bloqueada por" numbers to item ids and only touches changed items (idempotency).
- Open issues are listed with `state: "open"`, optional `label`, `limit` 200 by default. Known
  `source: github` items still `open` that were not listed are re-read with `getIssue`; the closed ones
  go in a second upsert whose `updated` count is `SyncResult.closed`; the still-open ones go in the
  first batch.
- Contract deviation: `GhCliGitHubProvider` (#68) takes its env when built, so the env cannot be
  handed to an existing provider. The route builds a provider per sync with the env of the project
  (`resolveGithubEnv`: project `githubCredentialId` → `GH_TOKEN`, else `{}` = host `gh`), and
  `syncGithubIssues` receives that `github` provider instead of a `githubEnv` callback. It also
  receives a `clock` for `SyncResult.at`.
- Provider failures become `SyncResult.error` (no throw). The route module wraps the sync for the
  scheduler so it logs `error` and never rejects; the scheduler re-arms after each round
  (setTimeout chain via `Clock`, no overlap) and `stop()` cancels the pending timer.
- The scheduler runs every 5 min (`GITHUB_SYNC_INTERVAL_MS`) over projects with `githubRepo`; started
  in `onReady`, stopped in `onClose` of `registerWorkItemsRoutes`.
- No project-level default label exists in settings (#24); the route accepts an optional `label` in
  the body.

## Tasks

- [x] 1. Test + impl: first sync creates the items — `src/server/work_items/github_sync.ts`, `github_sync.test.ts`
- [x] 2. Test: second sync without changes changes nothing (idempotency)
- [x] 3. Test + impl: an issue closed on GitHub becomes `closed` (getIssue for missing open items)
- [x] 4. Test: "blocked by" in the body resolves to item ids
- [x] 5. Test + impl: project without GitHub returns the error in the result
- [x] 6. Test + impl: provider failure ends in the result's `error`
- [x] 7. Test + impl: label filter and limit are forwarded to the provider
- [x] 8. Test + impl: `resolveGithubEnv` (credential or host gh) — `src/server/work_items/github_env.ts`
- [x] 9. Test + impl: `POST /api/projects/:projectId/work-items/sync` answers with `SyncResult` — `work_items_routes.ts`
- [x] 10. Test + impl: `createSyncScheduler` syncs every interval with FakeClock, keeps running after an error, stops — `sync_scheduler.ts`
- [x] 11. Start/stop the scheduler with Fastify hooks in `registerWorkItemsRoutes`
- [ ] 12. Self-review checklist (section 5) and feedback loops (section 6)
