# Issue #56: Parser de mensagens de limite de uso do Claude Code

## Decisions

- Port `parseLimitResetTime`/`zonedTimeToUtc` from `.sandcastle/usage_guard.mts` (left untouched) into
  `src/integrations/agent_runtime/usage_limit_parser.ts`, pure (no I/O, `now` injected).
- `defaultTimeZone` defaults to the host zone via `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Invalid zone names (in the message or the default) fall back to the default zone, then UTC; never throw.
- Tests pass explicit `defaultTimeZone` so they don't depend on the host TZ.
- Fixtures are TS constants in `src/test/fixtures/usage_limit_messages.ts`.

## Tasks

- [ ] 1. Fixtures with the documented messages and variations — `src/test/fixtures/usage_limit_messages.ts`
- [ ] 2. Test + implement detection (`isLimit` true/false, no resetAt) — parser + test
- [ ] 3. Test + implement epoch reset — parser + test
- [ ] 4. Test + implement time-of-day reset (zone in message, default zone, today/tomorrow) — parser + test
- [ ] 5. Test + implement month/day reset (this year / next year) — parser + test
- [ ] 6. Test + implement invalid zone fallback — parser + test
- [ ] 7. Self-review checklist and feedback loops
