# Issue #77: Gatilhos por evento (incluindo limite resetado) e webhook local

## Decisions

- Pure matching (`matchesEventTrigger`, `eventItems`, `isEventTrigger`) and the listener live in
  `src/server/triggers/event_trigger_listener.ts`. Listener deps use `Pick<TriggerService, ...>`
  (a full `TriggerService` still fits the contract). Listener errors go to `console.error`, like
  `startQueuedFiresWhenRunsFinish`.
- Anti-loop: `FireInput.chain?: { depth; maxDepth }`. `trigger_firing` skips with
  "cadeia de gatilhos muito longa" when `depth > maxDepth`; started/queued fires with a chain store
  `message = JSON.stringify({ depth })`. `TriggerService.chainDepthOfRun(runId)` reads it back
  (0 when the run was not started by an event chain) via `TriggerRepository.findFireByRunId`.
  `run.finished` → depth of the finished run + 1; other events → depth 1. `maxChainDepth = 3`.
- Webhook token: 32 random bytes base64url; hash = sha256 hex; verify with `timingSafeEqual`.
- Input configs: `triggerConfigInputSchema` in `src/shared/trigger_types.ts` has the webhook variant
  without `tokenHash` (the server makes it). Create of a webhook returns `TriggerWithToken`
  (`Trigger & { token }`); `rotateWebhookToken(id)` too (route `POST /api/triggers/:id/rotate-token`,
  200). Update keeps the current hash of a webhook; switching another kind to webhook → 422.
- Webhook firing: `fireWebhookTrigger(deps: TriggerFiringDeps, id, { token, itemIds })` in
  `trigger_service.ts` (the webhook route module has no cron runner, so it can't build a service).
  `createTriggerFiringDeps(appDeps)` is exported from `triggers_routes.ts` for `webhook_routes.ts`.
  Reason "webhook". Wrong/missing token or non-webhook trigger → `UnauthorizedError` (401);
  remote IP not loopback (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`) → `ForbiddenError` (403). Both
  classes added to `src/server/errors.ts`.

## Tasks

- [x] 1. Test + implement `matchesEventTrigger` (event type, same project, run.finished flowId/status filters) — `event_trigger_listener.ts`/`.test.ts`
- [x] 2. Test + implement `eventItems` (work_item.created + event_items → [workItemId]) — same files
- [ ] 3. Test + implement chain-depth skip and depth message in firing + `chainDepthOfRun` — `trigger_firing.ts`, `trigger_repository.ts`, `trigger_service.ts`, `trigger_service.test.ts`
- [ ] 4. Test + implement `createEventTriggerListener` (limit_reset fires; failed run not fired with SUCCEEDED filter; event_items run with created item; A→B→A stops at depth 3; stop unsubscribes) — `event_trigger_listener.ts`/`.test.ts`
- [ ] 5. Test + implement `generateWebhookToken`/`verifyWebhookToken` — `webhook_tokens.ts`/`.test.ts`
- [ ] 6. Test + implement webhook create returns token once, update keeps hash, `rotateWebhookToken` — `trigger_types.ts`, `trigger_service.ts`, `trigger_service.test.ts`
- [ ] 7. Test + implement `fireWebhookTrigger` + errors 401/403 — `trigger_service.ts`, `errors.ts`
- [ ] 8. Test + implement `POST /api/hooks/:triggerId` (401, 403, 202, body) — `webhook_routes.ts`/`webhook_routes.test.ts`
- [ ] 9. Test + implement rotate-token route, token only on create/rotate, listener started by hooks — `triggers_routes.ts`/`.test.ts`
- [ ] 10. Self-review checklist and feedback loops
