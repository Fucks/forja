---
key: FLW-06
title: "Templates de fluxo embutidos"
type: issue
milestone: "Fase 3 — Modelo de fluxo"
labels: [tipo:feature, area:fluxo]
depends_on: [FLW-05]
---

## Contexto
Atende RF-EDT-08. O usuário não deve começar de um canvas vazio: o template padrão é o fluxo canônico do PRD
(TL → Dev ×3 → Reviewer ×1 → PR) e serve também de demonstração (#{OBS-06}). Os prompts dos templates partem dos
prompts reais do pipeline Sandcastle deste repositório (`.sandcastle/*-prompt.md`), adaptados para variáveis de
porta. O template completo "Pipeline Sandcastle" (com rebase e evidência) chega em #{GIT-05}.

## Objetivo
Existem os templates "Fábrica básica" e "Dev ↔ Review em loop com testes", listáveis pela API e usáveis para criar
um fluxo, ambos válidos para publicação.

## Escopo
**Inclui:** registro de templates, dois templates, prompts em arquivos `.md`, rotas de listar e criar a partir de template.
**Não inclui:** template "Pipeline Sandcastle" (#{GIT-05}), UI (#{EDT-11}).

## Especificação técnica
### Arquivos
Criar:
- `src/server/flows/templates/flow_template_registry.ts`
- `src/server/flows/templates/basic_factory.ts`
- `src/server/flows/templates/review_loop.ts`
- `src/server/flows/templates/prompts/tl_spec.md`
- `src/server/flows/templates/prompts/developer.md`
- `src/server/flows/templates/prompts/reviewer.md`
- `src/server/flows/templates/load_prompt.ts`
- `src/server/flows/templates/flow_templates.test.ts`
Alterar:
- `src/server/flows/flows_routes.ts`

### Contratos
```ts
export interface FlowTemplate { id: string; name: string; description: string; build(): FlowGraph }
export const FLOW_TEMPLATES: FlowTemplate[]; // #{GIT-05} acrescenta um item
```
- **basic_factory** ("Fábrica básica") — o fluxo canônico do PRD, igual a `buildCanonicalFlow()` de #{FLW-01}:
  1. `trigger(manual)` → `source(github, label "Sandcastle", skipBlocked: true)`.
  2. `map "Especificar"` (concorrência 1) com `agent "TL"`: workspace `none`, effort `high`, perfil
     `tlp_builtin_readonly`; saídas `summary: text` (a spec) e `result: json` `{ ready: boolean }`.
  3. `map "Desenvolver"` (concorrência 3) com `agent "Dev"`: workspace `item`, `maxIterations` 50, perfil
     `tlp_builtin_codegraph`, porta extra `spec: text` ligada a `TL.summary` (aresta correlacionada por item).
  4. `map "Revisar e abrir PR"` (concorrência 1) com `agent "Reviewer"` (workspace `item`, effort `high`,
     saída `{ approved: boolean, notes: string }`) → `git open_pr` (`bodyFrom: "summary"` do Reviewer).
  5. `output(done)`.
- **review_loop** ("Dev ↔ Review em loop com testes"): `trigger` → `source` → `map(concorrência 2)` contendo um
  `loop(maxIterations 3, until: review.approved == true, carry: ["notes"])` com `agent Desenvolver` → `script "npm run test"` →
  `agent Revisar`; a saída `exhausted` do loop vai para um `output(needs_human)`; a normal para `git open_pr` → `output(done)`.
- Prompts: adapte `.sandcastle/implement-prompt.md` e `review-prompt.md` (mantenha as regras de TDD, commits e
  padrões) trocando `{{TASK_ID}}`/`{{ISSUE_TITLE}}` por `{{item.number}}`/`{{item.title}}`, e `{{BRANCH}}` por
  `{{item.branch}}`. O prompt do TL pede uma especificação com critérios de aceite a partir de `{{item.body}}` e
  termina com o bloco `<output>`.
Rotas: `GET /api/flow-templates` e `POST /api/projects/:projectId/flows/from-template` `{ templateId, name }`.

### Passo a passo
1. Registro, carregador de prompts (lê os `.md` com `runtimeAssetPath` de #{F-04}, que funciona em dev e no build) e os dois templates construídos com `createDefaultNode`.
2. Layout inicial legível (posições em colunas de 320 px).
3. Rotas.
4. Teste: todo template passa em `validateFlowGraph` sem erros (com `checkPromptVariables`).

## Critérios de aceite
- [ ] `GET /api/flow-templates` lista os dois templates.
- [ ] Criar fluxo a partir de cada template gera um rascunho que publica sem erros.
- [ ] A "Fábrica básica" tem map de concorrência 3 para Dev e 1 para Revisar, como no PRD.
- [ ] O loop do segundo template tem teto 3 e saída `exhausted` ligada a "precisa de humano".
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `flow_templates.test.ts`: validade de cada template, concorrências, variáveis de prompt conhecidas, criação via rota.
