# Issue #95: Parser do stream-json do Claude Code

## Decisions

- Line shapes are validated with Zod schemas in `src/integrations/agent_runtime/stream_json_messages.ts`
  (non-strict objects, so unknown fields are ignored). The parser lives in `stream_json_parser.ts`; the
  `result` → `ClaudeResult` mapping lives in `claude_result.ts` and the init/api_retry wording in `system_messages.ts`, to keep each file to one concept.
- Non-JSON line → `raw`; JSON with a known `type` whose shape does not match the schema → `raw`;
  JSON without a known `type` (including the `{"_fixture":"sintética"}` marker and `stream_event`) → no events;
  blank line → no events.
- `tool_call.args` is compact JSON truncated to 4 096 chars; tool results are `raw` with
  `[resultado de <tool>] <first 500 chars>`; the tool name comes from the `tool_use` id seen earlier.
- `result` lines emit no events; they fill `result()`.
- Fixtures are read in tests with `node:fs` from `src/test/fixtures/stream_json/`.

## Tasks

- [x] 1. Fixtures: the five synthetic `.ndjson` files — `src/test/fixtures/stream_json/`
- [x] 2. Test + impl: non-JSON and truncated lines become `raw`; blank lines and unknown types are ignored — `stream_json_parser.ts`
- [x] 3. Test + impl: `assistant` text → `text` events and `lastAssistantText()`
- [x] 4. Test + impl: `tool_use` → `tool_call` with compact args truncated at 4 KB
- [x] 5. Test + impl: `tool_result` → `raw` with tool name and first 500 chars
- [x] 6. Test + impl: `system/init` → `init()` and summary `system` event; failed MCP → warning event
- [x] 7. Test + impl: `system/api_retry` → `system` retry event
- [x] 8. Test + impl: `result` → `ClaudeResult` (text, structuredOutput, usage from summed modelUsage or usage, cost, turns, session, duration, permission denials, errors) — `claude_result.ts`
- [x] 9. Tests: each of the five fixtures produces the expected events and result
- [x] 10. Refactor, self-review checklist (section 5) and feedback loops (section 6)
