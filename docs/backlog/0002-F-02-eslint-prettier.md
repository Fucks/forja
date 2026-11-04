---
key: F-02
title: "Configurar ESLint e Prettier com os padrões do projeto"
type: issue
milestone: "Fase 0 — Fundação"
labels: [tipo:infra, area:fundacao]
depends_on: [F-01]
---

## Contexto
O `CODING_STANDARDS.md` define 4 espaços, linhas de 100 colunas e arquivos em `snake_case`, e diz que ESLint e
Prettier aplicam a parte mecânica. Com #{F-01} o projeto compila; falta o lint que o reviewer do Sandcastle e o
CI (#{F-08}) vão rodar.

## Objetivo
`npm run lint` e `npm run format` existem, passam no código atual e reprovam nomes de arquivo fora de `snake_case`.

## Escopo
**Inclui:** ESLint flat config com typescript-eslint, react-hooks e check-file; Prettier; scripts.
**Não inclui:** regras de React além de hooks.

## Especificação técnica
### Arquivos
Criar:
- `eslint.config.mjs`
- `.prettierrc.json`
- `.prettierignore`
Alterar:
- `package.json` (scripts `lint`, `format`, `format:check` — as dependências já vêm de #{F-01})

### Contratos
- `.prettierrc.json`: `{ "tabWidth": 4, "printWidth": 100, "singleQuote": false, "trailingComma": "all" }`.
- `.prettierignore`: `dist`, `coverage`, `.sandcastle/logs`, `.sandcastle/worktrees`, `package-lock.json`.
- ESLint: `typescript-eslint` `recommendedTypeChecked` em `src/**/*.{ts,tsx}`, `eslint-plugin-react-hooks`,
  `eslint-config-prettier`, `eslint-plugin-check-file` com `filenames: SNAKE_CASE` e `folders: SNAKE_CASE`
  em `src/**`. Ignorar `dist/`, `.sandcastle/`, `coverage/`.
- Regras extras: `@typescript-eslint/no-explicit-any: error`, `@typescript-eslint/consistent-type-imports: error`.

### Passo a passo
1. Instale `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-check-file`, `eslint-config-prettier`, `prettier`.
2. Escreva `eslint.config.mjs` e `.prettierrc.json`.
3. Scripts: `"lint": "eslint ."`, `"format": "prettier --write ."`, `"format:check": "prettier --check ."`.
4. Rode `npm run format` e corrija o que o lint apontar.

## Critérios de aceite
- [ ] `npm run lint` passa no repositório.
- [ ] Um arquivo `src/lib/BadName.ts` faz o lint falhar (verifique localmente e não commite o arquivo).
- [ ] `.sandcastle/` não é analisado pelo lint.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
Sem testes unitários novos; o próprio `npm run lint` é a verificação.
