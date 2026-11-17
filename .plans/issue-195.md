# Issue #195: Comando no motor: container isolado, variáveis de ambiente, falha por exit code e saída JSON

## Decisions

- `scriptConfigSchema` stays a plain `z.object` (the inspector and `node_docs.test.ts` read `.shape`), so the
  old `workspace: "item"` field is dropped by Zod's default key stripping instead of a `z.preprocess`.
- `scriptEnvVarSchema` gets a `.refine` for "exactly one of value/credentialId" (Zod 4 keeps it a ZodObject).
- `ExecResult.stderrTail` is required; `ScriptedExec` (fake) makes it optional and defaults to `""`.
- `ExecOptions` gains `env?`, `cwd?`, `shell?`; Docker resolves a relative `cwd` against the workspace dir in the
  container and passes it with `docker exec -w` (new `workdir?` in `ContainerExecOptions`).
- `execHeadless` starts an ephemeral container (same mounts as `runHeadless`: repo read-only), runs the command
  and always removes it. Container name: `headlessContainerNameFor(runId, <random exec id>)`.
- Exit code ≠ 0 with `onFailure: "fail"` throws `ScriptFailedError`; new `NodeRunErrorKind` `"script_failed"`,
  retried with backoff like `runtime`; label added in `node_run_error_labels.ts` (outside the issue's file list).
- Credentials of script env vars are revealed by `loadRunCredentials` (registered in the redactor, so the
  log store masks them) and read through `RunCredentials.credentialValueOf(id)`. The executor also masks them
  (`createSecretRedactor`) in the raw lines it emits and in `stdout`/`stderr` of the result.
- `renderCommand` reuses `parsePromptTemplate`/`lookUpPath`; a missing value throws `CommandRenderError`
  ("Variável sem valor no comando: {{...}}"), mapped as a runtime error shown to users.
- New script nodes (`node_defaults`): label stays, `runIn: "item"`, `onFailure: "fail"`, outputs
  `result:json` + `output:text`. The review_loop template and the test factory's loop "tests" node set
  `onFailure: "continue"` explicitly so the loop still judges the exit code.
- Script validation rules live in `port_rules.ts` (`findScriptConfigProblems`) and are registered in
  `graph_validation.ts` next to the other port rules (validation_issues.ts untouched).

## Tasks

- [x] 1. Runtime contract: `ExecOptions` env/cwd/shell, `ExecResult.stderrTail`, `AgentRuntime.execHeadless`
      — `agent_runtime.ts`, fake (`fake_agent_runtime.ts`, `scripted_exec.ts`) recording env/cwd/shell, scripted
      runtime, existing test literals
- [x] 2. Docker workspace exec: env merge, cwd (`-w`), shell, separate stderr — `docker_workspace.ts`,
      `container_manager.ts`, `workspace_layout.ts`, tests
- [x] 3. Docker `execHeadless` in an ephemeral container with the repo read-only — `docker_agent_runtime.ts`, test
- [ ] 4. New script config contract (constants, env var schema, defaults, old `workspace` dropped)
      — `script_config.ts`, test
- [ ] 5. Test + implement `renderCommand` with shell-quoting and missing variable error
      — `script_environment.ts`, `script_environment.test.ts`
- [ ] 6. Test + implement `buildScriptEnvironment` (`FORJA_*`, inputs, user vars, precedence, credentials)
      — `script_environment.ts`, `run_credentials.ts`, factory
- [ ] 7. Test + implement `parseScriptOutput` — `script_output.ts`, test
- [ ] 8. Executor: `ScriptResult`, `output` port, `onFailure` (`script_failed`), runIn item/isolated, parseOutput,
      masking — `script_executor.ts`, `script_executor.test.ts`, `error_mapping.ts`, `node_run_state.ts`,
      `retry_policy.ts`, labels; move script tests from `deterministic_executors.test.ts`
- [ ] 9. Defaults + templates keep loop green — `node_defaults.ts`, `review_loop.ts`, `flow_graph_factory.ts`
- [ ] 10. Output shapes for `script.result` (with `data: object`) and `script.output` — `node_output_shapes.ts`,
      `available_data.test.ts`
- [ ] 11. Validation: item required only with `runIn: "item"`; empty command, `image` without isolated,
      duplicated env name — `port_rules.ts`, `graph_validation.ts`, `graph_validation.test.ts`
- [ ] 12. Docs: `script_doc.ts` and regenerated `docs/nos/script.md`
- [ ] 13. Self-review checklist (section 5) and feedback loops (section 6)
