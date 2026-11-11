# Issue #76: Gatilho cron com fuso e próximo disparo

## Decisions

- Pure functions live in `src/engine/cron_schedule.ts` over `croner` (`new Cron(expr, { timezone, mode: "5-part" })`);
  `nextRun(after)` is strictly after `after`. Never-firing expressions (`0 0 31 2 *`) are invalid.
- Extra pure helper `validateTimezone` (same result shape as `validateCron`) so a bad IANA zone is a 422 too.
- `createCronRunner` deps: `fire(id, { reason: CRON_FIRE_REASON })` (reason `"cron"`), as the issue's bullet says.
- The runner arms one `clock.setTimeout` per enabled schedule trigger; the next fire is computed after
  `max(now, lastFiredAt)` so a restart never fires twice. Missed fires are not recovered, only logged.
  Timers longer than the platform max are split (woken early → re-armed).
- `reschedule(id)` reloads the triggers and cancels the old timer after the await, so concurrent calls don't
  leak timers. After `stop()` nothing is armed.
- `TriggerServiceDeps` gets `cronRunner: Pick<CronRunner, "reschedule">`; the service validates schedule
  configs (DomainValidationError → 422) and calls `reschedule` after create/update/remove.
- `TriggerRepository.listByKind(kind)` feeds `listScheduleTriggers` (small addition outside the file list).
- The list route answers `ListedTrigger` (shared type) = `Trigger` + `cronDescription` and `nextFireAt` for
  schedule triggers (`nextFireAt` only when enabled).

## Tasks

- [x] 1. Test + implement `validateCron` and `validateTimezone` — `src/engine/cron_schedule(.test).ts`
- [x] 2. Test + implement `nextFireAt` with timezones and DST of other zones — `src/engine/cron_schedule(.test).ts`
- [x] 3. Test + implement `describeCron` (daily, hourly, weekdays, fallback) — `src/engine/cron_schedule(.test).ts`
- [x] 4. Test + implement runner start/fire/next fire — `src/server/triggers/cron_runner(.test).ts`
- [x] 5. Test + implement reschedule on edit, disable cancels, stop — `cron_runner(.test).ts`
- [x] 6. Test + implement late timer (> 2 min) logs and fires once; restart doesn't fire twice; missed fire logged — `cron_runner(.test).ts`
- [ ] 7. Test + implement service: cron validation and runner notification — `trigger_service(.test).ts`, `trigger_repository.ts`
- [ ] 8. Test + implement routes: runner hooks, 422 for invalid cron, `nextFireAt`/description in the list — `triggers_routes(.test).ts`, `src/shared/trigger_types.ts`
- [ ] 9. Self-review checklist and feedback loops (typecheck, lint, test)
