# Issue #4: Servidor Fastify, CLI forja e diretório de dados

## Decisions

- `loadEnv(source = process.env)` is the only reader of `process.env`; invalid values throw
  `InvalidEnvError` whose message (pt-BR) lists every invalid variable.
- `resolvePaths` uses `node:path` only (`path.resolve` for an explicit dir, `<home>/.forja` by default);
  `ensureDataDirs` creates `root`, `logs/` and `tmp/` (the files `forja.db`/`master.key` belong to #6/#19).
- `AppDeps` = `{ env, paths, options: ServerOptions }` with `ServerOptions { seedDemo: boolean }`
  (the issue says `--seed-demo` travels in `AppDeps` as `options.seedDemo`).
- `buildApp` registers every `routeModules` entry inside its own plugin with prefix `/api`, Zod validator
  and serializer from `fastify-type-provider-zod`; logger level from `FORJA_LOG_LEVEL`.
- Health `version` comes from `package.json` (`"version": "0.1.0"` added) via a JSON import
  (`resolveJsonModule` enabled in `tsconfig.json`).
- Route stubs for every domain listed in the issue table: `export const registerXRoutes: RouteModule = () => {};`.
- CLI flags parsed with `node:util` `parseArgs`; flags override env by building the env source
  (`FORJA_PORT`, `FORJA_DATA_DIR`) before `loadEnv`.

## Tasks

- [x] 1. Test + implement `loadEnv` defaults, invalid port and non-loopback host — `src/lib/env.ts`, `src/lib/env.test.ts`
- [x] 2. Test + implement `resolvePaths` (home default, explicit dir, path with spaces) and `ensureDataDirs` — `src/lib/paths.ts`, `src/lib/paths.test.ts`
- [x] 3. Test + implement `buildApp`, `routeModules` with stubs and `GET /api/health` — `src/server/app.ts`, `src/server/route_modules.ts`, `src/server/health/health_routes.ts`, stubs, `src/server/app.test.ts`
- [x] 4. `startServer` with graceful shutdown on SIGINT/SIGTERM — `src/server/main.ts`
- [x] 5. CLI `forja` with flags, browser opening, `bin` and `dev:server` script — `src/cli.ts`, `package.json`
- [x] 6. Self-review checklist and feedback loops; manual smoke run of `npm run dev:server`
