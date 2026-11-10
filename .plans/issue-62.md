# Issue #62: Credenciais no runtime e teste de credencial

## Decisions

- `buildAgentEnv` and `MissingCredentialError` live in `src/integrations/agent_runtime/agent_env.ts`.
  `MissingCredentialError` extends `WorkspaceError`, so `mapAgentError` gives `kind: "workspace"`.
- The Claude credential goes only in `AgentRunRequest.env` (per node, `docker exec`); the workspace /
  headless spec env carries only the GitHub token (`buildAgentEnv({ github, extra: {} })`). The agent env is
  `{ ...container.env, ...request.env }`, so an API key can never sit next to an OAuth token.
- "Sem retentativa": `NodeRunError` gets an optional `isRetryable?: false`; `decideRetry` takes the failure
  (`{ kind, isRetryable }`) instead of the bare kind and gives up when `isRetryable === false`.
  `run_rows.ts` keeps the field when reading back.
- `RuntimeCredential` (credential_service) gains `kind`, so the executor knows API key vs OAuth.
- New `src/server/runtime/run_credentials.ts` (`loadRunCredentials`) mirrors `run_tool_profiles.ts`: reveals,
  once per run, the Claude credential of each agent node (`node.credentialId ?? project.defaultCredentialId`)
  and the project's GitHub credential, registering every value in the redactor. A credential of another kind
  as the node's Claude credential counts as missing. The agent executor resolves it before opening the
  workspace or running headless.
- `ExecutorDeps` gets `redactor: Pick<SecretRedactor, "register">`.
- Test bed seeds the test project with a default Claude API key credential (so existing agent tests keep
  running); `useProjectSystemPrompt` keeps the other settings.
- `checkCredential` deps: `{ credentials, runtime, commands, clock, sandbox: { repoPath, image } }`. The
  contract listed `settings`, but `SettingsService` has nothing a project-less check can use (the image is
  per project), so it is replaced by `sandbox` (an empty dir under `paths.tmp` + the default agent image) and
  `commands` (needed for `gh auth status`). generic_env → `DomainValidationError` (cannot be tested).
- Agent failure message comes from `mapAgentError(error).message` (reuse; hides internal messages).
- Shared `CredentialCheckResult` type in `src/shared/credential_types.ts`.

## Tasks

- [ ] 1. Test+impl: API key → `ANTHROPIC_API_KEY` — `agent_env.ts`, `agent_env.test.ts`
- [ ] 2. Test+impl: OAuth → `CLAUDE_CODE_OAUTH_TOKEN`, never `ANTHROPIC_API_KEY` (even from `extra`) — `agent_env.ts`
- [ ] 3. Test+impl: GitHub → `GH_TOKEN` and `GITHUB_TOKEN`; `extra` passes through — `agent_env.ts`
- [ ] 4. Test+impl: `decideRetry` gives up on a failure marked not retryable — `retry_policy.ts`, `node_run_state.ts`, `scheduler.ts`, `run_rows.ts`
- [ ] 5. Test+impl: `mapAgentError` maps `MissingCredentialError` to a not-retryable workspace failure — `error_mapping.ts`, `agent_env.ts`
- [ ] 6. Test+impl: `revealForRuntime` returns the credential kind — `credential_service.ts`
- [ ] 7. Test bed seeds a default Claude credential; redactor in executor deps — `executor_test_bed.ts`, `executor.ts`, `app_executor.ts`
- [ ] 8. Test+impl: agent request env carries the node's Claude credential (OAuth case) — `run_credentials.ts`, `executor.ts`, `active_run.ts`, `node_executors.ts`, `node_run_execution.ts`, `agent_executor.ts`, `executor.test.ts`
- [ ] 9. Test+impl: GitHub token in workspace spec env and request env — `run_context.ts`, `active_run.ts`, `executor.test.ts`
- [ ] 10. Test+impl: node without Claude credential fails with the message and no retries — `agent_executor.ts`, `executor.test.ts`
- [ ] 11. Test: no secret in docker argv (FakeCommandRunner) — `docker_agent_runtime.test.ts`
- [ ] 12. Test+impl: `checkCredential` Claude success records ok — `credential_check.ts`, `credential_check.test.ts`
- [ ] 13. Test+impl: `checkCredential` Claude failure returns the agent error, records failure — `credential_check.ts`
- [ ] 14. Test+impl: `checkCredential` GitHub runs `gh auth status` with the token only in env — `credential_check.ts`
- [ ] 15. Test+impl: generic_env cannot be checked — `credential_check.ts`
- [ ] 16. Test+impl: route `POST /api/credentials/:id/check` — `credentials_routes.ts`, `credentials_routes.test.ts`
- [ ] 17. Test+impl: "Testar" button with inline result — `use_credentials.ts`, `credentials_page.tsx`, `credentials_page.test.tsx`
- [ ] 18. Self-review checklist and feedback loops (typecheck, lint, test)
