# Issue #41: Contrato AgentRuntime e FakeAgentRuntime roteirizável

## Decisions

- Contract types live in `src/integrations/agent_runtime/agent_runtime.ts`, exactly as in the issue;
  `Effort` / `PermissionMode` come from `src/shared/agent_types.ts`.
- Errors in `agent_errors.ts` follow the existing pattern (`readonly` constructor fields, `this.name`,
  pt-BR message).
- The fake schedules everything on the injected `FakeClock`: scripted events at
  `(i + 1) * durationMs / (events + 1)`, the result/error at `durationMs`.
- Default result: summary "ok", usage 1000 input / 200 output, no commits, 1 iteration.
- Steps match when every given criterion matches; `times` defaults to unlimited; with no matching step the
  run uses `defaultDurationMs` and the default result.
- `exec` returns exit code 0 by default; `scriptExec(command, result)` overrides it per command.
- Scripted errors happen at the end of `runAgent`/`runHeadless` (including `workspace`).

## Tasks

- [ ] 1. Contract types and typed errors — `agent_runtime.ts`, `agent_errors.ts`
- [ ] 2. Test + implement: a run resolves only after the scripted duration with the default/scripted result
- [ ] 3. Test + implement: step matching by nodeRunId/promptIncludes/workItemId and `times`
- [ ] 4. Test + implement: scripted events reach `onEvent` in order with the fake clock's `at`
- [ ] 5. Test + implement: each scripted error type rejects with its error class
- [ ] 6. Test + implement: aborting the signal rejects with `AgentCanceledError` and frees concurrency
- [ ] 7. Test + implement: call log and `peakConcurrentRuns()` for overlapping runs
- [ ] 8. Test + implement: workspaces (open/list/close, exec default and scripted, headless run)
- [ ] 9. Self-review checklist and feedback loops
