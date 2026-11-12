# Issue #86: Endurecimento de segurança local e auditoria

## Decisions

- `checkRequest` keeps the exact contract signature and is pure (no Fastify). Order: `/api/hooks/*`
  only checks the loopback `remoteAddress` (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`); every other request
  checks `Host` then `Origin` (403); paths under `/api` also need cookie `forja_session` = token (401).
  The path is normalized with `new URL(...)` before deciding, so `/api/hooks/../x` is not a hook.
- Static (non-`/api`) requests only check Host/Origin: index.html is what hands out the cookie.
- `AppDeps.apiProtection: ApiProtection` — discriminated union defined in `request_guard.ts`:
  `{ kind: "session"; token; port; allowsDevServer }` | `{ kind: "none" }`. `main.ts` builds the
  session one; `createTestAppDeps` uses `{ kind: "none" }` so the route tests stay as they are.
  The guard tests build the app with `kind: "session"`.
- Dev server (Vite 5317): when `allowsDevServer` (`NODE_ENV=development` via `src/lib/env.ts`), the hook
  also accepts the request checked against port 5317. `checkRequest` itself is unchanged.
- Cookies are parsed by a small `parseCookies` in `request_guard.ts` (no `@fastify/cookie` dep).
- Security headers (`nosniff`, `no-referrer`, CSP) go on every response through an `onSend` hook
  registered in `app.ts` (`src/server/security/security_headers.ts`).
- Cookie: `@fastify/static` `setHeaders` adds `Set-Cookie` when the served file is `index.html`
  (covers `/` and the SPA fallback). `serveWebApp` receives the session cookie value (or none).
- `createAuditLog({ db, clock }): AuditLog` in `src/server/security/audit_log.ts`; table `audit_log`
  (id, action, target_kind, target_id, details_json, created_at). `list` = newest first.
- Services receive `audit: AuditLog` in their deps (required). Route modules and `app_executor` build it
  with `createAuditLog({ db, clock })`. Tests use the SQLite one over the test db.
- Audited: `flow.published` (flow, details version), `credential.created|updated|deleted`
  (credential, never the value), `approval.resolved` (approval, details decision — expiry is not
  audited), `run.canceled` (run).
- `use_event_stream.ts`: EventSource always sends same-origin cookies; no `credentials` option exists.
  Left as is. `api_client.ts` and `use_agent_image.ts` fetches get `credentials: "same-origin"`.
- `secret_leak.test.ts`: app executor + `DockerAgentRuntime` over `FakeCommandRunner`; the scripted
  `claude` stdout prints the secret; checks the raw NDJSON log and every recorded argv.

## Tasks

- [x] 1. `createSessionToken` (32 bytes base64url) with test — `session_token.ts`, `session_token.test.ts`
- [x] 2. `checkRequest`: Host/Origin 403 and cookie 401 — `request_guard.ts`, `request_guard.test.ts`
- [x] 3. `checkRequest`: `/api/hooks/*` only checks loopback remoteAddress; static paths skip cookie
- [x] 4. `NODE_ENV` in env; `ApiProtection` in AppDeps; guard hook in `app.ts` (+ app-level tests, dev port)
- [x] 5. Security headers on every response — `security_headers.ts`, `app.ts`, test
- [x] 6. Session cookie on index.html — `static_routes.ts`, `static_routes.test.ts`
- [x] 7. Web client `credentials: "same-origin"` — `api_client.ts`, `use_agent_image.ts`
- [x] 8. `audit_log` migration, schema and `createAuditLog` with tests — `audit_log.ts`, `audit_log.test.ts`
- [x] 9. Audit `flow.published` — `flow_service.ts` + callers
- [x] 10. Audit credential created/updated/deleted — `credential_service.ts` + callers
- [ ] 11. Audit `approval.resolved` — `approval_service.ts` + callers
- [ ] 12. Audit `run.canceled` — `run_service.ts` + callers
- [ ] 13. `secret_leak.test.ts`: secret absent from log file and argv
- [ ] 14. Self-review checklist and feedback loops
