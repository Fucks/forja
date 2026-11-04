---
key: BRD-06
title: "Detalhe do item de trabalho com linha do tempo"
type: issue
milestone: "Fase 8 — Board e itens"
labels: [tipo:feature, area:board]
depends_on: [BRD-05, OBS-02]
---

## Contexto
Atende RF-BRD-03. "O que aconteceu com a issue 42?" — o card abre um drawer com a descrição, a linha do tempo de todos os
NodeRuns do item (em todas as runs), custo total, artefatos (spec do TL, PR) e atalhos para a run e para os logs.

## Objetivo
Clicar num card abre o drawer do item com descrição, dependências, linha do tempo de NodeRuns, custo, PR e ações (abrir
run, abrir logs do NodeRun, mover para "Precisa de humano"/"Concluído").

## Escopo
**Inclui:** drawer, rota de linha do tempo do item, ações de coluna manual.
**Não inclui:** edição de issue do GitHub.

## Especificação técnica
### Arquivos
Criar:
- `src/web/board/work_item_drawer.tsx`
- `src/web/board/item_timeline.tsx`
- `src/server/work_items/item_timeline.ts`
- `src/server/work_items/item_timeline.test.ts`
- `src/web/board/work_item_drawer.test.tsx`
Alterar:
- `src/web/board/board_view.tsx` (abrir o drawer)
- `src/server/work_items/work_items_routes.ts` (`GET /api/work-items/:id/timeline`)

### Contratos
```ts
export interface ItemTimelineEntry { runId: string; flowName: string; nodeRunId: string; nodeLabel: string; status: NodeRunStatusName;
    iteration: number; attempt: number; startedAt?: string; finishedAt?: string; costUsd?: number; summary?: string }
export async function buildItemTimeline(itemId: string, deps: { runs: RunRepository; usage: UsageService; flows: FlowService }): Promise<{ entries: ItemTimelineEntry[]; totalCostUsd: number; prUrl?: string; spec?: string }>;
```
`spec` = saída `summary` do primeiro nó do estágio "Especificar" (se existir) da run mais recente.

### Passo a passo
1. `buildItemTimeline` (ordenado por início desc) com testes.
2. Drawer lateral (480 px): cabeçalho (título, número com link, estado), descrição em Markdown simples, "Bloqueado por",
   spec do TL recolhível, linha do tempo (StatusBadge + nó + iteração/tentativa + duração + custo; clique abre
   `/runs/:runId` com o drawer daquele NodeRun), ações de coluna manual.

## Critérios de aceite
- [ ] A linha do tempo lista os NodeRuns do item de todas as runs, mais recentes primeiro.
- [ ] Custo total soma os NodeRuns do item.
- [ ] Clicar numa entrada abre a run com o NodeRun selecionado.
- [ ] "Mover para Precisa de humano" atualiza o card no board.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `item_timeline.test.ts`; `work_item_drawer.test.tsx` (API mockada).
