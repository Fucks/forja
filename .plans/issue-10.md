# Issue #10: Cliente da API e hook de eventos no front

## Decisions

- `ApiErrorBody` stays an `interface` (contract); `apiErrorBodySchema` in the same file is typed
  `z.ZodType<ApiErrorBody>` so the client can parse error bodies without a second shape.
- Server error mapping: `NotFoundError` 404 `not_found`, `ConflictError` 409 `conflict`,
  `DomainValidationError` 422 `invalid` (+details), Zod (route schema or `ZodError` thrown in a handler)
  400 `validation_error` with `details: { path, message }[]`, Fastify client errors (malformed JSON etc.)
  keep their 4xx status as `bad_request`, anything else 500 `internal` with a generic message (logged,
  no stack in the body).
- `registerErrorHandler` is called on the root app in `buildApp` before any route module, so every
  encapsulated scope inherits it. The static module's not-found handler is left untouched.
- `apiClient` prefixes `/api`, sends JSON only when a body is given, returns `undefined` for empty
  bodies, parses with the schema when given (a mismatch throws the `ZodError`).
- `queryClient` (exported const) with `retry: 1`, `staleTime: 5_000`.
- `useEventStream` listens to every `ForjaEventType` by name (the server sends named SSE events, so
  `onmessage` never fires); the list is a `Record<ForjaEventType, true>` so a new event type breaks the
  build. It closes the source on error and reconnects itself with backoff 1 s → 2 s → … → 30 s, reset
  on open. `onEvent` and `createSource` are kept in a ref so inline callbacks don't reconnect.
- The fake `EventSource` lives in `src/test/fakes/fake_event_source.ts`.

## Tasks

- [x] 1. `ApiErrorBody` + schema — `src/shared/api_types.ts`
- [x] 2. Test + implement domain errors → 404/409/422 — `src/server/errors.ts`, `src/server/errors.test.ts`
- [x] 3. Test + implement Zod validation → 400, malformed request → 4xx, unknown → 500 without stack — same files
- [x] 4. Register the error handler in `buildApp`; app test: invalid query on `/api/events` → 400 `ApiErrorBody` — `src/server/app.ts`, `src/server/app.test.ts`
- [x] 5. Test + implement `apiClient` success (prefix, JSON body, schema) — `src/web/api/api_client.ts`, `api_client.test.ts`
- [x] 6. Test + implement `ApiError` for error with body, without body, and schema mismatch — same files
- [x] 7. `queryClient` and `QueryClientProvider` in `main.tsx` — `src/web/api/query_client.ts`, `src/web/main.tsx`
- [x] 8. Fake `EventSource` — `src/test/fakes/fake_event_source.ts`
- [x] 9. Test + implement `useEventStream` delivers events and marks `connected` — `src/web/api/use_event_stream.ts`, `use_event_stream.test.tsx`
- [x] 10. Test + implement reconnection with backoff (fake timers), cap 30 s, reset on open, close on unmount — same files
- [ ] 11. Self-review checklist and feedback loops (typecheck, lint, test)
