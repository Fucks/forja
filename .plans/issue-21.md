# Issue #21: Diagnóstico do ambiente: Docker, git, gh e Node

## Decisions

- `src/shared/diagnostic_types.ts`: `DiagnosticStatus`, `DiagnosticItem`, `DiagnosticReport` (contract names).
- `src/server/diagnostics/diagnostic_checks.ts`: `DiagnosticCheck` type + `DIAGNOSTIC_CHECKS` in display
  order `node`, `git`, `docker`, `gh`, `gh-auth`. Every command runs with `timeoutMs` 10 s through the
  injected `CommandRunner`; `timedOut` → `error` item whose detail names the command.
- Docker check runs `docker --version` (absent → error, fix "Instale o Docker Desktop") then
  `docker version --format {{.Server.Version}}` (fails → error "Docker instalado mas não está rodando").
  execa runs without a shell, so the format template has no quotes.
- gh absent → `warning` (PRs need it, agents don't); `gh auth status` failing → `warning` with fix
  `gh auth login`.
- Service passes `process.versions.node` as `nodeVersion` (contract has no field for it); the node
  < 22 case is tested on the check itself. Checks run with `Promise.all`; cache default 30 s.
- Route `GET /api/diagnostics?force=1`; one service per app so the cache is shared.
- Web: hook in `src/web/app/settings/use_diagnostics.ts` (pattern of `use_tool_profiles.ts`);
  "Verificar de novo" fetches `?force=1` and replaces the query data.

## Tasks

- [x] 1. Shared types — `src/shared/diagnostic_types.ts`
- [x] 2. Test + impl: all items `ok` with a fake simulating a healthy machine — `diagnostic_service.test.ts`, `diagnostic_checks.ts`, `diagnostic_service.ts`
- [x] 3. Test + impl: node < 22 is an error — `diagnostic_checks.ts`
- [x] 4. Test + impl: Docker absent and Docker without daemon are errors with documented fix
- [x] 5. Test + impl: gh absent and gh without auth are warnings
- [x] 6. Test + impl: timed-out command becomes an error and every command gets the 10 s timeout
- [x] 7. Test + impl: cache for 30 s, `force` and expiry
- [x] 8. Route `GET /api/diagnostics?force=1` — `diagnostics_routes.ts`
- [x] 9. Test + impl: page shows summary and items — `diagnostics_page.tsx`, `use_diagnostics.ts`, `diagnostics_page.test.tsx`
- [x] 10. Test + impl: "Verificar de novo" refetches with `force=1`
- [ ] 11. Self-review checklist and feedback loops (typecheck, lint, test)
