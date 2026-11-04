---
key: BRD-04
title: "Nó source: buscar itens respeitando dependências"
type: issue
milestone: "Fase 8 — Board e itens"
labels: [tipo:feature, area:board]
depends_on: [BRD-03, ENG-13]
---

## Contexto
Atende RF-RUN-01 e a regra fixa do PRD "o source não entrega itens bloqueados". No template padrão o fluxo começa por
`source(github, label "Sandcastle", skipBlocked)` — o equivalente ao planner do pipeline atual, que escolhe as issues
desbloqueadas. Quando a run começa com itens escolhidos (board, manual), o source ainda filtra os bloqueados.

## Objetivo
O executor do nó `source` produz `items` (lista de `WorkItemSnapshot`) a partir do GitHub (com sync antes) ou dos itens
locais, filtrando por label, estado aberto, sem PR aberto da Forja, não bloqueados e até o limite, em ordem estável.

## Escopo
**Inclui:** executor `source`, regra de seleção pura, interação com itens iniciais da run, artefato com o motivo dos excluídos.
**Não inclui:** priorização por IA (Pós-MVP).

## Especificação técnica
### Arquivos
Criar:
- `src/server/runtime/executors/source_executor.ts`
- `src/server/runtime/executors/select_source_items.ts`
- `src/server/runtime/executors/source_executor.test.ts`
Alterar:
- `src/server/runtime/node_executors.ts`

### Contratos
```ts
export interface SourceSelection { selected: WorkItem[]; excluded: { itemId: string; reason: "blocked" | "closed" | "label" | "has_open_pr" | "limit" | "in_other_run" }[] }
export function selectSourceItems(input: { candidates: WorkItem[]; all: Map<string, WorkItem>; config: SourceConfig;
    requestedIds?: string[]; itemsInActiveRuns: Set<string>; itemsWithOpenPr: Set<string> }): SourceSelection;
```
Regras: se a run tem itens iniciais (`requestedIds`), parte deles; senão de todos os itens do provider/label. Exclui
fechados, bloqueados (`isBlocked`, quando `skipBlocked`), itens já em outra run ativa do projeto e itens com PR aberto
(artefato `pr_url` de uma run anterior com PR `open` — consulte `RunRepository`). Ordem: número da issue crescente (itens
locais por `createdAt`). Corta em `limit`. O motivo de cada exclusão vai num artefato `source_selection` (aparece no drawer).
Provider `github`: chama `syncGithubIssues` (#{BRD-03}) antes de selecionar.

### Passo a passo
1. `selectSourceItems` puro com testes.
2. Executor: sync (github), carga, seleção, `outputs.items` como snapshots (#{ENG-10}) e artefato.
3. Registro.

## Critérios de aceite
- [ ] Issue bloqueada por outra aberta não é selecionada (motivo `blocked`); fechar o bloqueador libera na próxima run.
- [ ] Item já sendo processado em outra run ativa é excluído (`in_other_run`).
- [ ] `limit: 3` com 5 elegíveis entrega os 3 de menor número.
- [ ] Run iniciada com itens escolhidos entrega só esses (menos os bloqueados).
- [ ] O artefato `source_selection` lista os excluídos e motivos.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `source_executor.test.ts`: regras de seleção e o executor com `FakeGitHubProvider`.
