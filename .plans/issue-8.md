# Issue #8: Relógio, ids e formatadores compartilhados

## Decisions

- `newId` uses `monotonicFactory` from the `ulid` dependency (already in package.json), so ids created
  in the same millisecond still sort lexically. Format: `<prefix>_<ULID>`.
- Formatters truncate (floor) instead of rounding, so a value never displays as the next unit
  (59_999 ms → "59,9 s", not "60 s"). Numbers use `Intl.NumberFormat("pt-BR")`.
- `formatUsd` builds "US$ " with a regular space (Intl uses a non-breaking one); amounts below one cent
  keep 2 significant digits, the rest use 2 decimals.
- Zero secondary units are omitted in `formatDuration` (60_000 → "1 min").
- Negative or non-finite inputs throw `RangeError` in every formatter.
- `package-lock.json` local modification is unrelated to this issue; never commit it.

## Tasks

- [x] 1. `Clock` interface and `systemClock` with cancellable timeout — `src/lib/clock.ts`
- [x] 2. Test + implement `FakeClock` now/set/advance firing due timers in time order, skipping cancelled,
      firing timers scheduled during advance — `src/test/fakes/fake_clock.ts`, `fake_clock.test.ts`
- [ ] 3. Test + implement `newId` with prefix and lexical ordering — `src/lib/ids.ts`, `ids.test.ts`
- [ ] 4. Test + implement `formatDuration` — `src/lib/format.ts`, `format.test.ts`
- [ ] 5. Test + implement `formatTokens` — `src/lib/format.ts`, `format.test.ts`
- [ ] 6. Test + implement `formatUsd` — `src/lib/format.ts`, `format.test.ts`
- [ ] 7. Test + implement `formatRelativeOffset` — `src/lib/format.ts`, `format.test.ts`
- [ ] 8. Self-review checklist and feedback loops (typecheck, lint, test)
