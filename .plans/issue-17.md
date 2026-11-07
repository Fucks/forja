# Issue #17: Cadastrar projeto a partir de um repositório git local

## Decisions

- `CommandRunner` contract exactly as the issue; `ExecaCommandRunner` maps a missing `exitCode`
  (killed/timed out) to `-1`; a missing executable (ENOENT) becomes a result with `exitCode: -1`, not a throw.
- `FakeCommandRunner`: `when(command, args).returns(result)`, records `calls`; unscripted call → exit 1.
- `NotARepoError` lives in `src/integrations/git/git_provider.ts`; `parseGithubRepo(url)` is exported from
  `cli_git_provider.ts` and unit-tested in `cli_git_provider.test.ts` (pure, no git).
- `CliGitProvider` takes a `CommandRunner` (git timeout constant `GIT_TIMEOUT_MS`).
- `FakeGitProvider`: `addRepo(info, { subdirectories, branches })`; `inspectRepo` of an unknown path
  throws `NotARepoError`.
- Service converts `NotARepoError` into `DomainValidationError` (→ 422, `code: "invalid"`); duplicate
  `repoPath` → `ConflictError` (→ 409); unknown id → `NotFoundError` (→ 404). Errors from `src/server/errors.ts`.
- Base branch default: `development` when it exists, otherwise `RepoInfo.defaultBranch`.
- Detection uses `fileExists(path.join(root, entry))` for `.codegraph`, `CODING_STANDARDS.md`, `.sandcastle`.
- Routes: `AppDeps` gains `commands` and `git` only; the route module wires `systemClock` and
  `existsSync`. `src/server/route_modules.ts` is not touched. `main.ts` builds `ExecaCommandRunner` +
  `CliGitProvider` (ServerDeps omits them).
- Test helper `src/test/test_app_deps.ts` builds AppDeps for app-level tests (reused by app.test.ts and
  projects_routes.test.ts).

## Tasks

- [x] 1. `CommandRunner` interface + `ExecaCommandRunner` — `src/integrations/process/*`
- [x] 2. `FakeCommandRunner` (scripted, records calls) + its test — `src/test/fakes/fake_command_runner*.ts`
- [x] 3. `GitProvider` interface + `NotARepoError` — `src/integrations/git/git_provider.ts`
- [x] 4. `parseGithubRepo` tests (HTTPS/SSH, with/without .git, non-GitHub) — `cli_git_provider.test.ts`
- [x] 5. `CliGitProvider` over `CommandRunner` + tests with `FakeCommandRunner` — `cli_git_provider.ts`
- [x] 6. `FakeGitProvider` — `src/test/fakes/fake_git_provider.ts`
- [x] 7. Migration, Drizzle schema, `ProjectRepository` — `0100_projects.sql`, `schema/projects.ts`, `project_repository.ts`
- [x] 8. Types + `createProjectInput` — `src/server/projects/project_types.ts`
- [x] 9. Service create: normalizes to root, githubRepo, baseBranch default, detection — `project_service.ts` + test
- [x] 10. Service create: rejects non-repo (422) and duplicate (409) — test + impl
- [x] 11. Service list/get (NotFound)/rename/remove (no repo touch) — test + impl
- [ ] 12. `AppDeps` gains `commands`/`git`; test helper; main.ts wiring — `app.ts`, `main.ts`, `app.test.ts`
- [ ] 13. Routes GET/POST /projects, GET/PATCH/DELETE /projects/:id + tests — `projects_routes*.ts`
- [ ] 14. Integration test with real `git init` — `cli_git_provider.integration.test.ts`
- [ ] 15. Self-review checklist and feedback loops
