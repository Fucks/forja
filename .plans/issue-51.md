# Issue #51: Executor: liga motor, runtime de agente, banco e eventos

## Decisions

- Reuse `WorkItemSnapshot` from `src/shared/work_item_types.ts` (already has `branch`, built by #50 as
  `forja/issue-<n>` / `forja/item-<id>`); `ItemSource` lives in `executor.ts`.
- Scheduler gets `pause_requested` / `resume_requested`. Pause: RUNNING → PAUSED `user`; a run already
  paused by the limit/budget switches to `pauseReason: "user"` (drops `resumeAt`). Resume: only a user
  pause; requeues WAITING_LIMIT NodeRuns, goes RUNNING and advances.
- `createExecutor` deps accept an optional `nodeExecutors` (defaults to the registry) so the e2e test
  can fake source/git/output nodes (#54/#70/#79 own them). A node type without executor fails its
  NodeRun with `UnsupportedNodeTypeError` (kind `runtime`).
- Per-run state lives in `src/server/runtime/active_run.ts` (class `ActiveRun`) to keep `executor.ts`
  small; command → `ForjaEvent` mapping in `src/server/runtime/run_events.ts`; input truncation in
  `src/server/runtime/recorded_inputs.ts`.
- Each `run_changed`/`node_run_changed` command → `runs.saveTransition({ run|nodeRuns, snapshot })`, then
  publish. Events are processed through a serialized promise queue per run.
- `WorkspacePool.acquire(item, hooks, signal)`: the NodeRun that opens the workspace receives the setup
  events and its signal aborts the open; a failed open is forgotten so the next acquire retries.
- Items whose NodeRuns are all terminal (scheduler snapshot) release their workspace after each batch;
  terminal run → release all and cancel wakeups; the run leaves `activeRunIds()`.
- Operations on runs that are not active throw `NotFoundError` (reloading finished runs is #52).
- `mapAgentError`: unknown errors get a generic Portuguese message (no internal messages to users).
- Permission mode fixed to `bypassPermissions` until tool profiles are applied (TODO(#61)).
- Cost is 0 until #59; tokens = input + output.
- Wiring: `src/server/runtime/app_executor.ts` builds the executor from `db`/`events`/`runtime`/`clock`;
  `flows_routes.ts` exports `buildValidationContext` for reuse.
- Tests drive time with `FakeClock.advance` in 1 s steps + `setImmediate` flushes
  (`src/test/executor_test_bed.ts`).

## Tasks

- [x] 1. Test + implement `pause_requested`/`resume_requested` in the scheduler — `src/engine/scheduler.ts`, `scheduler_types.ts`, `scheduler.test.ts`, `scheduler_harness.ts`
- [ ] 2. Test + implement `mapAgentError` and `usageLimitResetAt` — `src/server/runtime/error_mapping.ts` (+ test)
- [ ] 3. `buildPromptContext` — `src/server/runtime/run_context.ts`
- [ ] 4. Test: concurrent acquire opens once; release closes; failed open retried — `workspace_pool.test.ts`
- [ ] 5. Implement `createWorkspacePool` — `src/server/runtime/workspace_pool.ts`
- [ ] 6. Node executor contracts + registry — `src/server/runtime/node_executors.ts`
- [ ] 7. Agent executor (defaults, prompt + conventions, item/none workspace, outputs) — `executors/agent_executor.ts`
- [ ] 8. `UnavailableAgentRuntime` — `src/integrations/agent_runtime/unavailable_agent_runtime.ts`
- [ ] 9. Test bed for the executor — `src/test/executor_test_bed.ts`
- [ ] 10. Test: canonical flow with 4 items succeeds, peak 3 Devs / 1 Reviewer — `executor.test.ts`
- [ ] 11. Implement `createExecutor` + `ActiveRun` + `run_events` + `recorded_inputs` until 10 passes
- [ ] 12. Test: one workspace per item opened once and closed; `none` nodes use `runHeadless`
- [ ] 13. Test: prompt has rendered variables and project system prompt
- [ ] 14. Test: every transition is saved before its event is published
- [ ] 15. Test: pause stops new starts, resume continues
- [ ] 16. Test: usage limit pauses the run and resumes after `resumeAt`, publishing limit events
- [ ] 17. Test: cancel run aborts running agents, closes workspaces, ends CANCELED; cancelNodeRun
- [ ] 18. Test: startRun without published version → DomainValidationError; inputs truncated above 256 KB
- [ ] 19. Wire `agentRuntime` and `executor` into `AppDeps` — `app.ts`, `main.ts`, `app_executor.ts`, `test_app_deps.ts`
- [ ] 20. Self-review checklist (section 5) and feedback loops (section 6)
