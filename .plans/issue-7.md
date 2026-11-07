# Issue #7: EventBus tipado e stream SSE /api/events

## Decisions

- `src/shared/events.ts` already has the status lists; add `ForjaEvent`, `ForjaEventType` and
  `EventEnvelope` exactly as in the issue contract.
- `createEventBus(clock: { now(): Date })` keeps the contract signature; ids start at 1; the buffer keeps
  the last `EVENT_BUFFER_CAPACITY = 5000` envelopes. A listener that throws is reported with
  `console.error` and the remaining listeners still receive the envelope.
- `main.ts` creates the bus with `systemClock` (`src/lib/clock.ts`); `ServerDeps` omits `db` and `events`.
- The SSE route is built by `createEventsRoutes({ heartbeatIntervalMs })`; `registerEventsRoutes` is that
  factory with 15 s, so tests inject a short interval. `route_modules.ts` is not touched.
- Filters are ANDed; with `runId` set, events without a `runId` are not delivered. Replay and subscribe
  happen in the same synchronous tick so no event is lost between them.

## Tasks

- [x] 1. Event catalog types (`ForjaEvent`, `ForjaEventType`, `EventEnvelope`) — `src/shared/events.ts`
- [x] 2. Test + implement: subscribers receive envelopes in order with increasing ids and `at` from the clock — `src/server/runtime/event_bus.ts`, `event_bus.test.ts`
- [x] 3. Test + implement: unsubscribe stops delivery — same files
- [x] 4. Test + implement: a throwing listener does not stop the others — same files
- [x] 5. Test + implement: `since(lastId)` returns later envelopes; the 5001st discards the 1st — same files
- [ ] 6. `AppDeps` gains `events: EventBus`; `main.ts` creates the bus; update `app.test.ts` — `src/server/app.ts`, `src/server/main.ts`
- [ ] 7. Test + implement: SSE stream sends `id`/`event`/`data` with `text/event-stream` — `src/server/events/events_routes.ts`, `events_routes.test.ts`
- [ ] 8. Test + implement: replay by `Last-Event-ID` — same files
- [ ] 9. Test + implement: `runId` and `projectId` filters — same files
- [ ] 10. Test + implement: `: ping` heartbeat and listener removed on close — same files
- [ ] 11. Self-review checklist and feedback loops
