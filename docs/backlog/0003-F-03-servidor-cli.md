---
key: F-03
title: "Servidor Fastify, CLI forja e diretório de dados"
type: issue
milestone: "Fase 0 — Fundação"
labels: [tipo:infra, area:fundacao]
depends_on: [F-02]
---

## Contexto
A Forja é um app web local (PRD, "Stack e arquitetura"): um servidor Node no host serve a API e a SPA e é
iniciado pelo comando `forja`. Todos os domínios seguintes registram rotas aqui. Atende RNF-LOC-01 e RNF-SEG-01
(bind só em `127.0.0.1`).

## Objetivo
`npm run dev:server` (e o bin `forja`) sobe um Fastify em `127.0.0.1:4317` com `GET /api/health`, usando um
diretório de dados configurável, e o servidor é testável com `app.inject`.

## Escopo
**Inclui:** `buildApp(deps)`, `main.ts`, CLI com flags, `env.ts`, `paths.ts`, lista de módulos de rota.
**Não inclui:** SPA (#{F-04}), banco (#{F-05}), SSE (#{F-06}), token de sessão (#{QA-03}).

## Especificação técnica
### Arquivos
Criar:
- `src/lib/env.ts`
- `src/lib/paths.ts`
- `src/server/app.ts`
- `src/server/main.ts`
- `src/server/route_modules.ts`
- `src/server/health/health_routes.ts`
- `src/cli.ts`
- `src/server/app.test.ts`
- `src/lib/paths.test.ts`
- `src/lib/env.test.ts`
Alterar:
- `package.json` (`"bin": { "forja": "./dist/cli.js" }`; script `"dev:server": "tsx watch src/cli.ts --no-open"`)

### Contratos
```ts
// src/lib/env.ts — única leitura de process.env no projeto
export const envSchema = z.object({
    FORJA_DATA_DIR: z.string().optional(),
    FORJA_PORT: z.coerce.number().int().min(1).max(65535).default(4317),
    FORJA_HOST: z.literal("127.0.0.1").default("127.0.0.1"),
    FORJA_AGENT_RUNTIME: z.enum(["sandcastle", "fake"]).default("sandcastle"),
    FORJA_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});
export type Env = z.infer<typeof envSchema>;
export function loadEnv(source?: Record<string, string | undefined>): Env;

// src/lib/paths.ts
export interface ForjaPaths { root: string; database: string; logs: string; masterKey: string; tmp: string }
export function resolvePaths(dataDir: string | undefined, homeDir: string): ForjaPaths; // padrão <home>/.forja
export function ensureDataDirs(paths: ForjaPaths): void;

// src/server/app.ts
export interface AppDeps { env: Env; paths: ForjaPaths }
export async function buildApp(deps: AppDeps): Promise<FastifyInstance>;

// src/server/route_modules.ts — lista FECHADA; issues futuras não alteram este arquivo
export type RouteModule = (app: FastifyInstance, deps: AppDeps) => Promise<void> | void;
export const routeModules: RouteModule[];
```

Para que dezenas de issues paralelas não editem o mesmo arquivo, `route_modules.ts` já importa **todos** os módulos
de rota do MVP. Crie cada um como stub (`export const registerXRoutes: RouteModule = () => {};`); a issue dona
**substitui o conteúdo do stub** e nunca edita `route_modules.ts`:

| Stub | Issue dona |
|---|---|
| `src/server/health/health_routes.ts` (implementado aqui) | #{F-03} |
| `src/server/events/events_routes.ts` | #{F-06} |
| `src/server/projects/projects_routes.ts` | #{PRJ-01} |
| `src/server/credentials/credentials_routes.ts` | #{CFG-02} |
| `src/server/diagnostics/diagnostics_routes.ts` | #{CFG-03} |
| `src/server/tool_profiles/tool_profiles_routes.ts` | #{CFG-04} |
| `src/server/settings/settings_routes.ts` | #{CFG-05} |
| `src/server/flows/flows_routes.ts` | #{FLW-04} |
| `src/server/runs/runs_routes.ts` | #{ENG-12} |
| `src/server/runs/logs_routes.ts` | #{RT-03} |
| `src/server/usage/usage_routes.ts` | #{RT-05} |
| `src/server/agent_images/agent_images_routes.ts` | #{RT-06} |
| `src/server/work_items/work_items_routes.ts` | #{BRD-01} |
| `src/server/triggers/triggers_routes.ts` | #{TRG-01} |
| `src/server/triggers/webhook_routes.ts` | #{TRG-03} |
| `src/server/approvals/approvals_routes.ts` | #{GIT-03} |
| `src/server/static/static_routes.ts` (sempre o último da lista) | #{F-04} |

Convenção para tarefas em segundo plano de um domínio (sincronização, cron, limpeza): o próprio módulo de rotas as
inicia com `app.addHook("onReady", ...)` e as para com `app.addHook("onClose", ...)` — assim nenhuma issue precisa
alterar `main.ts` para isso. Documente essa convenção num comentário no topo de `route_modules.ts`.
`GET /api/health` → `{ status: "ok", version: string, dataDir: string }`. Arquivos dentro de `root`:
`forja.db`, `logs/`, `master.key`, `tmp/`.

CLI (`src/cli.ts`): `forja [--port <n>] [--data-dir <path>] [--no-open] [--seed-demo]`. `--seed-demo` é aceito e
repassado em `AppDeps` como `options.seedDemo` (implementado em #{OBS-06}). Abre o navegador em
`http://127.0.0.1:<port>` (pacote `open`) salvo `--no-open`. Flags sobrescrevem as variáveis de ambiente.

### Passo a passo
1. Implemente `loadEnv` com Zod (erro legível listando variáveis inválidas).
2. Implemente `resolvePaths` (puro, com `node:path`) e `ensureDataDirs`.
3. Em `buildApp`, crie o Fastify com `withTypeProvider<ZodTypeProvider>()`, validador e serializador Zod, e
   registre cada item de `routeModules` com prefixo `/api`.
4. `health_routes.ts` exporta `registerHealthRoutes`; inclua em `routeModules`.
5. `main.ts`: `startServer({ env, paths, options })` escuta em `FORJA_HOST`/`FORJA_PORT` e encerra limpo em SIGINT/SIGTERM.
6. `cli.ts`: parse com `node:util` `parseArgs`, `ensureDataDirs`, `startServer`, abrir navegador.

## Critérios de aceite
- [ ] `GET /api/health` responde 200 com `status: "ok"` e o `dataDir` resolvido.
- [ ] Sem `--data-dir` nem `FORJA_DATA_DIR`, o diretório é `<home>/.forja`.
- [ ] O servidor só escuta em `127.0.0.1`; `FORJA_HOST=0.0.0.0` é rejeitado por `loadEnv`.
- [ ] `FORJA_PORT=abc` gera erro claro.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `src/server/app.test.ts`: `app.inject` em `/api/health`.
- `src/lib/env.test.ts`: defaults, porta inválida, host diferente de 127.0.0.1.
- `src/lib/paths.test.ts`: padrão no home, `dataDir` explícito, caminho com espaço.
