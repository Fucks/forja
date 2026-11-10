# Issue #81: Nó gate e aprovações humanas (backend)

## Decisions

- `Approval`, `ApprovalStatus`, `ApprovalDecision` and the route Zod schemas live in
  `src/shared/approval_types.ts`; `ApprovalService` (contract) lives in `approval_service.ts`, which
  also has `expireOfNodeRun(nodeRunId)` (timeout and canceled gates mark the approval `expired`).
- `resolve` answers 409 through `ConflictError` (`ApprovalNotPendingError extends ConflictError`).
- The service publishes `approval.requested` / `approval.resolved` on the `EventBus`.
- Executor contract: `NodeExecutor<Outcome = NodeExecutionResult>`; the registry holds
  `NodeExecutor<NodeExecutionOutcome>` where `NodeExecutionOutcome = NodeExecutionResult |
  WaitingForApproval` and `WaitingForApproval = { waiting: "approval"; approvalId; expiresAt? }`
  (`expiresAt` is an addition so the scheduler can schedule the timeout).
- New scheduler events: `node_run_waiting_approval { nodeRunId, expiresAt?, at }` (RUNNING →
  WAITING_APPROVAL, ignored when the NodeRun is no longer RUNNING) and the contract's
  `approval_resolved` (accepted from WAITING_APPROVAL or RUNNING, so an early answer is not lost).
- New scheduler command `expire_approval { nodeRunId }`, emitted on timeout and when a waiting
  gate is canceled; `ActiveRun` carries it out with `approvals.expireOfNodeRun`.
- Gate outputs: `{ [decision]: inputs.item, comment: comment ?? "" }` (`src/engine/gate_decision.ts`).
  Timeout → `rejected` with comment `APPROVAL_TIMEOUT_COMMENT = "tempo esgotado"`.
- Approval deadlines are kept by `src/engine/approval_deadlines.ts` and saved in the snapshot
  (`approvalDeadlines`), so `wakeupTimesOf` re-arms them after a restart.
- `Executor.resolveApproval(id, decision, comment?)` resolves through the service and then delivers
  `approval_resolved` to the active run; `POST /api/approvals/:id/resolve` calls it.
- `ExecutorDeps.approvals: ApprovalService`; the gate executor is registered by `createExecutor`
  (it needs only `approvals`), so the test bed and the app get it without extra wiring.
- Diff: only when `show` includes `"diff"` and the gate has an item; `workspace.diff(baseBranch)`
  truncated to 200 KB (bytes). `FakeAgentRuntime.scriptDiff(diff)` sets the fake diff.

## Tasks

- [ ] 1. Shared types `src/shared/approval_types.ts`, migration `0900_approvals.sql`, schema `db/schema/approvals.ts`, `ApprovalRepository`
- [ ] 2. Test + implement `ApprovalService.create/get/listPending` (event `approval.requested`) — `approval_service.test.ts`
- [ ] 3. Test + implement `ApprovalService.resolve` (409 when not pending, event `approval.resolved`) and `expireOfNodeRun`
- [ ] 4. Scheduler test: gate waits in WAITING_APPROVAL without taking an agent slot — `scheduler.test.ts`, harness
- [ ] 5. Scheduler: `node_run_waiting_approval` event and WAITING_APPROVAL state
- [ ] 6. Scheduler test + implement `approval_resolved`: approved/rejected ports with the comment
- [ ] 7. Scheduler test + implement timeout → rejected with "tempo esgotado" + `expire_approval`; deadlines in snapshot and wakeups
- [ ] 8. Scheduler test + implement: cancel of the run cancels a waiting gate and expires its approval; waiting gate survives restart (not interrupted)
- [ ] 9. Gate executor test + implement (`gate_executor.ts`): creates approval with truncated diff, returns waiting
- [ ] 10. Executor contract: `NodeExecutionOutcome`, `NodeRunExecution` delivers the waiting event, `ActiveRun` runs `expire_approval`, `Executor.resolveApproval`; wiring in app_executor/test bed
- [ ] 11. Routes test + implement `approvals_routes.ts` (list pending, get, resolve, 409) incl. end-to-end gate through the executor and restart
- [ ] 12. Self-review checklist (section 5) and feedback loops (section 6)
