---
key: F-01
title: "Configurar projeto TypeScript, scripts npm e Vitest"
type: issue
milestone: "Fase 0 — Fundação"
labels: [tipo:infra, area:fundacao]
depends_on: []
---

## Contexto

Primeira issue do backlog (RNF-MAN-01). O repositório hoje só tem o pipeline Sandcastle (`.sandcastle/`), o
`CODING_STANDARDS.md` e um `package.json` mínimo com `@ai-hero/sandcastle`, `tsx` e `zod` e o script
`sandcastle`. Todas as issues seguintes rodam `npm run typecheck` e `npm run test` antes de commitar, então
esses scripts precisam existir e passar desde já.

## Objetivo

O projeto compila em TypeScript strict (ESM, Node ≥ 22) e `npm run typecheck` e `npm run test` passam com um teste de exemplo.

## Escopo

**Inclui:** `tsconfig.json`, Vitest com setup, config de integração, scripts npm, alias `@/` → `src/`, teste de exemplo.
**Não inclui:** ESLint/Prettier (#{F-02}), servidor (#{F-03}), React/Vite (#{F-04}).

## Especificação técnica

### Arquivos

Criar:

- `tsconfig.json`
- `vitest.config.ts`
- `vitest.integration.config.ts`
- `src/test/setup.ts`
- `src/lib/assert_never.ts`
- `src/lib/assert_never.test.ts`
  Alterar:
- `package.json` (**mesclar**: manter `@ai-hero/sandcastle`, `tsx`, `zod`, `"type": "module"` e o script `sandcastle`)

### Contratos

`tsconfig.json`: `"strict": true`, `"noUncheckedIndexedAccess": true`, `"module": "NodeNext"`,
`"moduleResolution": "NodeNext"`, `"target": "ES2023"`, `"jsx": "react-jsx"`, `"lib": ["ES2023", "DOM",
"DOM.Iterable"]`, `"types": ["node", "vitest/globals"]`, `"paths": { "@/*": ["./src/*"] }`, `"noEmit": true`,
`"allowImportingTsExtensions": false`, `include: ["src", "e2e", "*.config.ts"]`, `exclude: [".sandcastle", "dist"]`.

```ts
// src/lib/assert_never.ts
export function assertNever(value: never, message?: string): never;
```

Scripts:

```json
"typecheck": "tsc --noEmit",
"test": "vitest run",
"test:watch": "vitest",
"test:integration": "vitest run --config vitest.integration.config.ts"
```

`vitest.integration.config.ts` inclui só `src/**/*.integration.test.ts`; o `vitest.config.ts` principal os exclui.

**Todas as dependências do MVP são instaladas aqui**, de uma vez, para que as dezenas de issues seguintes não editem
`package.json` em paralelo (o planner do Sandcastle bloqueia issues que mexem no mesmo arquivo). Versões: a estável mais
recente de cada uma. `@ai-hero/sandcastle` continua **só em `devDependencies`**: ele é usado pelo pipeline `.sandcastle/` que desenvolve a Forja, não pelo produto (a Forja tem runtime próprio).

- `dependencies`: `zod`, `fastify`, `fastify-type-provider-zod`, `@fastify/static`,
  `better-sqlite3`, `drizzle-orm`, `execa`, `open`, `ulid`, `yaml`, `croner`, `diff`, `react`, `react-dom`,
  `react-router`, `@tanstack/react-query`, `@tanstack/react-virtual`, `zustand`, `@xyflow/react`, `elkjs`,
  `@radix-ui/react-dialog`, `@radix-ui/react-select`, `@radix-ui/react-switch`, `@radix-ui/react-slider`,
  `@radix-ui/react-toggle-group`, `@radix-ui/react-slot`, `@radix-ui/react-toast`, `@radix-ui/react-tooltip`,
  `@radix-ui/react-tabs`, `clsx`, `tailwind-merge`, `lucide-react`, `@fontsource/ibm-plex-sans`,
  `@fontsource/ibm-plex-sans-condensed`, `@fontsource/jetbrains-mono`, `@uiw/react-codemirror`,
  `@codemirror/autocomplete`, `@codemirror/lang-markdown`, `@codemirror/view`, `@codemirror/state`, `recharts`, `@dnd-kit/core`.
- `devDependencies`: `@ai-hero/sandcastle` (versão atual, para o pipeline), `typescript`, `tsx`, `vitest`, `@types/node`, `vite-tsconfig-paths`, `eslint`, `typescript-eslint`,
  `eslint-plugin-react-hooks`, `eslint-plugin-check-file`, `eslint-config-prettier`, `prettier`, `vite`,
  `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `@testing-library/react`, `@testing-library/jest-dom`,
  `@testing-library/user-event`, `jsdom`, `tsup`, `concurrently`, `@types/react`, `@types/react-dom`,
  `@types/better-sqlite3`, `@types/diff`, `@playwright/test`.

Se uma issue futura precisar de um pacote que não está aqui, ela o adiciona e declara dependência da última issue que
alterou `package.json`.

### Passo a passo

1. Instale as dependências acima (`npm install …` e `npm install -D …`). Não remova nada do `package.json` atual.
2. Crie `tsconfig.json` como acima.
3. Crie `vitest.config.ts` com `globals: true`, `environment: "node"`, `setupFiles: ["src/test/setup.ts"]`,
   `include: ["src/**/*.test.{ts,tsx}"]`, `exclude: ["**/*.integration.test.ts", "e2e/**", ".sandcastle/**"]`,
   plugin `vite-tsconfig-paths` e número máximo de workers lido de `process.env.VITEST_MAX_WORKERS` (o pipeline
   Sandcastle define 4; sem a variável, usa o padrão).
4. Crie `vitest.integration.config.ts` e os scripts.
5. Implemente `assertNever` e teste que ele lança com a mensagem.
6. Rode `npm install`, `npm run typecheck`, `npm run test`.

## Critérios de aceite

- [ ] `npm run typecheck` passa.
- [ ] `npm run test` roda o teste de exemplo e passa; `*.integration.test.ts` não é incluído.
- [ ] O script `sandcastle` e as dependências originais continuam no `package.json`.
- [ ] Import com alias `@/lib/assert_never` funciona no teste.
- [ ] `npm run typecheck` e `npm run test` passam.

## Testes

- `src/lib/assert_never.test.ts`: lança erro com a mensagem informada; a mensagem padrão inclui o valor recebido.
