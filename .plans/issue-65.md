# Issue #65: Logs em streaming no drawer do nó

## Decisions

- `toLogLines(events, startedAt)` in `src/web/logs/to_log_lines.ts` is pure; offsets are clamped at 0
  (`formatRelativeOffset` rejects negatives).
- tool_call → `text = "▸ <name>"`, no `toolName` (it would print the name twice), `detail` = args
  indented when they are JSON, the raw args otherwise.
- Tool results reach the store as raw lines `[resultado de <tool>] <output>` (built by
  `stream_json_parser.ts`); those become `tool_result` lines `◂ resultado de <tool>` with the output
  (JSON indented when possible) as the collapsed detail. Any other raw line → `system` with
  `isRawOutput: true` (new optional field of `LogLine`) so the filters can hide it.
- `useNodeRunLogs(nodeRunId, runId, createEventSource?)`: the third optional param mirrors `useLiveRun`
  for tests. No TanStack Query: local state, pages of 2 000 via `GET /api/node-runs/:id/logs?fromSeq=&limit=`,
  then `log.appended` of the run (same nodeRunId) fetches from the event's `fromSeq`; merged events are
  deduplicated by `seq` and sorted. Each (re)connection of the stream, after the history, fetches
  from the last known seq + 1 (appends announced while the stream was closed are lost to it). `startedAt` = `at` of the first event (the hook only has ids).
- Filters (`log_filters.tsx`): `"text_and_tools"` (default, hides raw output), `"text_only"`
  (text + error), `"raw"` (everything). UI is the existing `SegmentedControl`.
- `LogViewer` gets optional `renderLine?: LogLineRenderer` = `(line, searchQuery) => ReactNode`, which
  replaces the default text of the line summary; `event_renderers.tsx` exports `renderAgentEventLine`
  (tool name in `text-steel`).
- The panel of the Logs tab lives in a new `src/web/canvas/live/node_run_logs.tsx` (filter, viewer,
  download through an `<a download>` to `/api/node-runs/:id/logs/raw`, full screen in a `lg` Dialog).
  The default tab of the drawer stays "Entradas".

## Tasks

- [x] 1. Test + implement `toLogLines` for text, system and offsets — `src/web/logs/to_log_lines.ts`
- [x] 2. Test + implement tool_call lines (JSON and non-JSON args) — `to_log_lines.ts`
- [x] 3. Test + implement raw lines: tool results collapsed, other raw as muted system — `to_log_lines.ts`, `log_types.ts`
- [x] 4. Test + implement history loading in pages of 2 000 until the end — `src/web/logs/use_node_run_logs.ts`
- [x] 5. Test + implement incremental loading on `log.appended` with dedupe by seq — `use_node_run_logs.ts`
- [x] 6. Test + implement the error when the logs cannot be loaded — `use_node_run_logs.ts`
- [x] 7. Test + implement the `renderLine` prop of `LogViewer` — `log_viewer.tsx`, `log_line_list.tsx`, `log_line.tsx`
- [x] 8. Implement `renderAgentEventLine` — `src/web/logs/event_renderers.tsx`
- [x] 9. Implement the log filters — `src/web/logs/log_filters.tsx`
- [x] 10. Test (drawer) + implement the Logs tab: events in order, tool call expands — `node_run_logs.tsx`, `node_run_detail.tsx`
- [x] 11. Test + implement the filter "Bruto" showing raw lines — `node_run_logs.tsx`
- [x] 12. Test + implement the raw download — `node_run_logs.tsx`
- [x] 13. Test + implement full screen dialog — `node_run_logs.tsx`
- [x] 14. Self-review checklist and feedback loops (typecheck, lint, test)
