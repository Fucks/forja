---
key: F-04
title: "SPA React + Vite + Tailwind servida pelo servidor"
type: issue
milestone: "Fase 0 — Fundação"
labels: [tipo:infra, area:fundacao]
depends_on: [F-03]
---

## Contexto

A interface da Forja é uma SPA React servida pelo próprio servidor de #{F-03} (PRD, "Stack e arquitetura"). Em
desenvolvimento, o Vite roda com proxy de `/api` para o servidor; em produção, o servidor entrega `dist/web`.

## Objetivo

`npm run dev` sobe servidor e Vite juntos, a página inicial mostra "Forja" e o status de `/api/health`, e
`npm run build` gera `dist/web` e `dist/cli.js`, com o servidor servindo a SPA com fallback para `index.html`.

## Escopo

**Inclui:** Vite + React 19 + React Router, Tailwind v4, Testing Library + jsdom, build do servidor (tsup), static + fallback.
**Não inclui:** tokens de design (#{DS-01}), cliente da API (#{F-09}).

## Especificação técnica

### Arquivos

Criar:

- `vite.config.ts`
- `index.html`
- `src/web/main.tsx`
- `src/web/app/routes.tsx`
- `src/web/app/home_page.tsx`
- `src/web/app/home_page.test.tsx`
- `src/web/styles/global.css`
- `src/server/static/static_routes.ts`
- `src/server/static/static_routes.test.ts`
- `tsup.config.ts`
  Alterar:
- `package.json` (scripts `dev`, `build`, `start`)
- `vitest.config.ts` (testes em `src/web/**` rodam em `jsdom`)
- `src/test/setup.ts` (import `@testing-library/jest-dom/vitest`)
- (o arquivo `*_routes.ts` desta issue já existe como stub criado em #{F-03}: substitua o conteúdo; **não** altere `src/server/route_modules.ts`)

### Contratos

Scripts:

```json
"dev": "concurrently -k -n server,web \"npm:dev:server\" \"vite\"",
"build": "vite build && tsup",
"start": "node dist/cli.js"
```

- Vite: `build.outDir: "dist/web"`, `server.port: 5317`, `server.proxy: { "/api": "http://127.0.0.1:4317" }`.
- tsup: entrada `src/cli.ts`, `format: "esm"`, `platform: "node"`, `target: "node22"`, `outDir: "dist"`, dependências externas; `onSuccess` copia para `dist/` os arquivos não-TS que o servidor lê em tempo de execução — `src/server/db/migrations/*.sql` → `dist/migrations/`, `src/server/**/prompts/*.md` → `dist/prompts/<mesmo caminho relativo>`, `assets/` → `dist/assets/` — e exporte de `src/lib/paths.ts` um helper `runtimeAssetPath(...segments)` que resolve o caminho em dev (fonte) e no build (`dist`). Assim nenhuma issue futura precisa alterar `tsup.config.ts`.
- `registerStaticRoutes(app, deps)`: se `dist/web` (resolvido relativo ao bundle) existir, serve com
  `@fastify/static` e responde `index.html` para GET que não começa com `/api`; senão não registra nada.

### Passo a passo

1. Configure Vite com `@vitejs/plugin-react` e `@tailwindcss/vite`; `global.css` com `@import "tailwindcss";`.
2. `routes.tsx` exporta `createAppRouter()` com `/` → `HomePage`.
3. `HomePage` busca `/api/health` e mostra "Forja" e "servidor: ok" (ou "servidor indisponível").
4. Implemente `registerStaticRoutes` e o fallback.
5. Configure tsup e scripts.

### Notas de design

Placeholder sem estilo próprio — o visual chega com #{DS-01}.

## Critérios de aceite

- [ ] `npm run dev` abre a SPA em `http://localhost:5317` com o status do servidor.
- [ ] `npm run build && npm run start -- --no-open` serve a SPA em `127.0.0.1:4317`; `/qualquer/rota` devolve `index.html`; `/api/health` continua JSON.
- [ ] Testes de componentes rodam em jsdom; testes de servidor continuam em node.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `home_page.test.tsx`: com `fetch` mockado mostra "servidor: ok"; com falha mostra "servidor indisponível".
- `static_routes.test.ts`: com diretório temporário contendo `index.html`, rota desconhecida devolve o HTML e `/api/x` não.
