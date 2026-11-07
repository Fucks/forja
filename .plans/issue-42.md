# Issue #42: Máquinas de estado de Run e NodeRun

## Decisions

- `src/shared/events.ts` is owned by #7 (still open). The contract imports the status names from it, so this
  issue creates the file with **only** `RUN_STATUS_NAMES`, `NODE_RUN_STATUS_NAMES`, `RunStatusName` and
  `NodeRunStatusName`, copied verbatim from #7's contract, so #7 just adds the rest of the catalog.
- `InvalidTransitionError` lives in `src/engine/invalid_transition_error.ts`, shared by both machines. It
  keeps `machine` ("Run" | "NodeRun"), `from` and `to`; message `Transição inválida de <machine>: FROM → TO`.
- Transition tables are `Record<From, readonly To[]>`; terminal states map to `[]`.
- Timestamps record the **first** entry: `queuedAt`/`startedAt` are kept when already set (a resumed run or
  a re-queued node run keeps its original times); `finishedAt` is set on entering a terminal state.
- Result is `{ ...state, ...timestamps, ...extra, status: to }`: `extra` may override timestamps, never `status`.
- Leaving `PAUSED` clears `pauseReason` and `resumeAt` (unless `extra` sets them again).
- Package-lock change in the working tree is not ours: never stage it.

## Tasks

- [x] 1. Status name constants and types — `src/shared/events.ts`
- [x] 2. Test + implement `InvalidTransitionError` message with from/to — `src/engine/invalid_transition_error.ts`
- [x] 3. Test full (from, to) matrix for `canTransitionRun` + `RUN_TERMINAL` — `src/engine/run_state.ts`
- [x] 4. Test + implement `transitionRun`: rejects invalid pairs, timestamps, `extra`, clears pause — `src/engine/run_state.ts`
- [x] 5. Test full (from, to) matrix for `canTransitionNodeRun` + `NODE_RUN_TERMINAL` — `src/engine/node_run_state.ts`
- [x] 6. Test + implement `transitionNodeRun`: rejects invalid pairs, timestamps, `extra` — `src/engine/node_run_state.ts`
- [x] 7. Self-review checklist (section 5) and feedback loops (section 6)
