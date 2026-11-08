# Issue #68: GitHubProvider via gh: issues, dependências e PRs

## Decisions

- Contracts (interfaces, `parseBlockedBy`, `createGhCliGitHubProvider`) live in
  `src/integrations/github/github_provider.ts` and `blocked_by_parser.ts`, exactly as named in the issue.
- `GitHubError` (message + `stderr`) lives in `github_provider.ts`, next to the interface.
- `parseBlockedBy` accepts both the inline form ("Bloqueada por: #12, #15") and the list form the
  backlog script actually injects ("Bloqueada por:" followed by "- #17 — título" bullets).
- `gh` JSON is validated with Zod schemas inside `gh_cli_github_provider.ts`.
- Native dependencies: `gh api .../dependencies/blocked_by --jq '.[].number'`; stderr containing
  "HTTP 404" → ignored; other failures → `GitHubError`. Merged with body numbers, deduplicated.
- PR view and list both request `mergedAt`; `merged` when `mergedAt` is set.
- Bodies (comment, PR) always go through `input` (stdin) with `--body-file -`.
- `env` from deps is passed to every `gh` call (GH_TOKEN optional).
- Tests use `FakeCommandRunner` with recorded JSON outputs.

## Tasks

- [ ] 1. Test + implement `parseBlockedBy` (inline, list, aliases, dedup, none) — `blocked_by_parser.ts`
- [ ] 2. Interface, types and `GitHubError` — `github_provider.ts`
- [ ] 3. Test + implement `listIssues` parsing gh JSON and body dependencies — `gh_cli_github_provider.ts`
- [ ] 4. Test + implement native dependencies merge without duplicates and 404 tolerance
- [ ] 5. Test + implement `getIssue`, `comment` (stdin), `closeIssue`
- [ ] 6. Test + implement `createPullRequest` (stdin, --draft, view by URL)
- [ ] 7. Test + implement `findPullRequestByHead` (merged via mergedAt, undefined when none)
- [ ] 8. Test + implement gh failures become `GitHubError` with stderr
- [ ] 9. In-memory fake — `src/test/fakes/fake_github_provider.ts`
- [ ] 10. Self-review checklist and feedback loops
