# Issue #5: SPA React + Vite + Tailwind servida pelo servidor

## Decisions

- `buildApp` registers every route module under `/api`; the SPA must live at the root, so `app.ts`
  registers `routeModules` minus `registerStaticRoutes` under `/api` and `registerStaticRoutes` at the root
  (`route_modules.ts` stays untouched, as the issue demands).
- `runtimeAssetPath(kind, ...segments)` in `src/lib/paths.ts`; `kind` is the first folder of the `dist/`
  layout (`migrations`, `prompts`, `assets`). In source mode (module file ends in `.ts`) each kind
  maps to its source folder: `src/server/db/migrations`, `src/server` (prompts keep their path relative to
  `src/server`), `assets`. Built on `createRuntimeAssetResolver(moduleFile)` so both modes are testable.
- `registerStaticRoutes` = `serveWebApp(app, <dist/web next to the bundle>)`; from the sources that folder
  doesn't exist, so nothing is served (Vite serves the SPA in dev) and tests never depend on a local
  build. `serveWebApp(app, webDir)` is the testable part (temp dir in tests). Fallback via `setNotFoundHandler`: GET outside `/api` → `index.html`;
  else 404 JSON.
- Vitest uses `projects`: `server` (node, everything outside `src/web`) and `web` (jsdom, `src/web/**`).
  `vitest.integration.config.ts` drops the projects so it keeps running only `*.integration.test.ts`.
- `HomePage` fetches `/api/health` with plain `fetch` (the API client is #10).

## Tasks

- [x] 1. Vitest projects (node/jsdom) + jest-dom setup — `vitest.config.ts`, `vitest.integration.config.ts`, `src/test/setup.ts`
- [x] 2. Test + implement `HomePage` showing "servidor: ok" / "servidor indisponível" — `src/web/app/home_page.tsx`, `home_page.test.tsx`
- [x] 3. `createAppRouter`, `main.tsx`, `index.html`, `global.css`, `vite.config.ts`
- [x] 4. Test + implement `runtimeAssetPath` for source and build — `src/lib/paths.ts`, `paths.test.ts`
- [x] 5. Test + implement `serveWebApp`/`registerStaticRoutes` with fallback — `src/server/static/static_routes.ts`, `static_routes.test.ts`
- [x] 6. Register the static module at the root, outside `/api` — `src/server/app.ts`
- [x] 7. tsup config with asset copy + `dev`/`build`/`start` scripts — `tsup.config.ts`, `package.json`
- [x] 8. Manual check: `npm run build && npm run start -- --no-open` serves SPA, fallback, `/api/health` JSON; `npm run dev` serves on 5317
- [x] 9. Self-review checklist (section 5) and feedback loops (section 6)
