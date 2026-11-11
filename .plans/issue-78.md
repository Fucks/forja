# Issue #78: Tela de gatilhos e pausa global

## Decisions

- Hooks in `src/web/app/triggers/use_triggers.ts` follow `use_credentials.ts`: `apiClient` + React Query,
  mutations invalidate the triggers list (and the history of the trigger they touch).
- Query keys: `["triggers", projectId]`, `["trigger-history", triggerId, limit]`, `["triggers-paused"]`.
- "Último disparo e resultado" comes from the history endpoint with `limit=1` per row (no server change).
- The project flows come from a new `useProjectFlows` next to `useFlowSummary`
  (`src/web/app/flows/use_flow_summary.ts`), sharing the same query key.
- Board column options: `deriveColumns` over the graph of the flow's latest published version
  (`GET /flows/:flowId/versions/:latestVersion`); without a published version the form says so.
- Kind and flow are not editable after creation (`updateTriggerInput` has no `flowId`, and the server
  refuses switching to webhook). A webhook edit sends no `config`, so the token is kept.
- Webhook curl example uses `window.location.origin` (the app is served by the server, 127.0.0.1:4317
  by default) + `/api/hooks/<id>` and header `X-Forja-Token`.
- Next fire shown from `ListedTrigger.cronDescription` + `formatDateTime(nextFireAt)`.
- Pause indicator in the topbar reads `GET /api/triggers/paused`; a failed query shows nothing.
- Schedule timezone defaults to the browser timezone (`Intl.DateTimeFormat().resolvedOptions()`).

## Tasks

- [x] 1. `CRON_PRESETS` and preset matching — `src/web/app/triggers/cron_presets.ts`
- [x] 2. Query/mutation hooks — `use_triggers.ts`, `useProjectFlows` in `use_flow_summary.ts`
- [x] 3. Test + list: name, flow, kind icon, policy, next fire, last fire/result, enabled switch —
      `triggers_page.tsx`, `triggers_page.test.tsx`
- [x] 4. Test + create schedule trigger "Todo dia às 22:00" (form with presets/custom, policy) —
      `trigger_form.tsx`
- [x] 5. Test + event fields (event, flow + status for run.finished) and board column select —
      `trigger_form.tsx`
- [x] 6. Test + create webhook shows token once with curl — `webhook_token_dialog.tsx`
- [x] 7. Test + edit, toggle enabled, remove — `triggers_page.tsx`, `trigger_form.tsx`
- [x] 8. Test + "Disparar agora" and history shows the result — `trigger_history.tsx`
- [x] 9. Test + pause all on the page and indicator with resume on the topbar — `topbar.tsx`
- [ ] 10. Self-review checklist and feedback loops (typecheck, lint, test)
