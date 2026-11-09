# Issue #54: Executores dos nós trigger, script, condition e output

## Decisions

- The scheduler keeps finishing the trigger inline (`succeedTrigger`); `executeTriggerNode` is registered
  for the contract and reads the run's item snapshots from a new `runItems` field of
  `NodeExecutionContext` (filled by `ActiveRun` → `NodeRunExecution`).
- The item workspace guard used by the agent executor moves to `executors/item_workspace.ts`
  (`acquireItemWorkspace`) and is reused by the script executor.
- Script timeout: `workspace.exec` gets `timeoutMs` from `config.timeoutMinutes`; the real workspace and
  the fake throw `AgentTimeoutError("total")`, the scheduler deadline cancels too → `timeout_total`.
- `stdoutTail` = last 200 lines of the `ExecResult.stdoutTail` the workspace returns.
- `FakeAgentRuntime.scriptExec(command, ...executions)` plays the executions in order (the last one
  repeats); each may have `outputLines` and `durationMs` (past `timeoutMs` → timeout error).
- Unit tests build the context with `buildNodeExecutionContext` in
  `src/test/factories/node_execution_context_factory.ts`.
- E2E loop: `buildLoopFlow()` with `until` = reviewer approved AND `testes.result.exitCode == 0`.

## Tasks

- [x] 1. Fake: scripted exec sequence, output lines and timeout — `src/test/fakes/fake_agent_runtime.ts`, `scripted_exec.ts`, test
- [x] 2. Factory `buildNodeExecutionContext` and `runItems` in the context — `node_executors.ts`, `node_run_execution.ts`, `active_run.ts`
- [x] 3. Trigger executor outputs the run items — `executors/trigger_executor.ts`, `deterministic_executors.test.ts`
- [x] 4. Script exit 1 gives `result.exitCode = 1` without failing — `executors/script_executor.ts`, `item_workspace.ts`
- [x] 5. Script lines become `raw` agent events — `script_executor.ts`
- [x] 6. Script stdoutTail keeps the last 200 lines — `script_executor.ts`
- [x] 7. Condition sends the value to the chosen port — `executors/condition_executor.ts`
- [x] 8. Output records the `item_outcome` artifact — `executors/output_executor.ts`
- [x] 9. Register executors; drop the output stub in the test bed — `node_executors.ts`, `executor_test_bed.ts`
- [x] 10. E2E: script timeout fails the NodeRun with `timeout_total`; script exit 1 NodeRun SUCCEEDED
- [x] 11. E2E: condition skips the other branch
- [x] 12. E2E: loop exits on iteration 2 when tests pass — `deterministic_executors.test.ts`
- [x] 13. Self-review checklist and feedback loops
