---
key: BRD-05
title: "Board kanban com colunas derivadas do fluxo"
type: issue
milestone: "Fase 8 — Board e itens"
labels: [tipo:feature, area:board]
depends_on: [BRD-04, ENG-12, DS-04]
---

## Contexto

Atende RF-BRD-01 e RF-BRD-03 — oportunidade do benchmark: o board **derivado do fluxo**. As colunas são as etapas do
fluxo padrão (cada map de nível superior ou nó agente fora de map vira uma coluna, na ordem topológica), mais
"Backlog", "Bloqueado", "Precisa de humano" e "Concluído". O card anda sozinho conforme o motor executa.

## Objetivo

Em `/projects/:projectId/board` o usuário vê os itens do projeto em colunas derivadas do fluxo padrão publicado, com
estado ao vivo, etapa atual, custo acumulado e link do PR, e pode sincronizar com o GitHub.

## Escopo

**Inclui:** `board_columns` puro (colunas a partir do grafo + posição do item a partir dos NodeRuns), API de board, página,
cards ao vivo, botão "Sincronizar".
**Não inclui:** arrastar cards e criar itens (#{BRD-07}), detalhe (#{BRD-06}).

## Especificação técnica

### Arquivos

Criar:

- `src/engine/board_columns.ts`
- `src/engine/board_columns.test.ts`
- `src/server/work_items/board_service.ts`
- `src/server/work_items/board_service.test.ts`
- `src/web/board/board_view.tsx`
- `src/web/board/work_item_card.tsx`
- `src/web/board/use_board.ts`
- `src/web/board/board_view.test.tsx`
  Alterar:
- `src/web/app/board/board_page.tsx` (substituir o placeholder)
- `src/server/work_items/work_items_routes.ts` (`GET /api/projects/:projectId/board`)

### Contratos

```ts
export interface BoardColumnDef {
    id: string;
    label: string;
    kind: "backlog" | "blocked" | "stage" | "needs_human" | "done";
    groupOrNodeId?: string;
}
export function deriveColumns(graph: FlowGraph): BoardColumnDef[];
// estágio = cada map de nível superior (rótulo do map) ou nó agent/gate/git fora de map, em ordem topológica
export function placeItem(
    item: WorkItem,
    ctx: {
        columns: BoardColumnDef[];
        graph: FlowGraph;
        latestNodeRuns: NodeRunState[];
        isBlocked: boolean;
        outcome?: "done" | "needs_human";
    },
): { columnId: string; status?: ExecutionStatus; currentNodeId?: string };
// prioridade: manualColumn/outcome → done/needs_human; fechado → done; NodeRun não terminal na run ativa → estágio que contém o nó; bloqueado → blocked; senão backlog
export interface BoardView {
    flowId?: string;
    columns: BoardColumnDef[];
    cards: {
        item: WorkItem;
        columnId: string;
        status?: ExecutionStatus;
        currentNodeLabel?: string;
        costUsd?: number;
        prUrl?: string;
        runId?: string;
    }[];
}
```

Sem fluxo padrão publicado: colunas só Backlog/Bloqueado/Precisa de humano/Concluído e aviso "Publique um fluxo padrão".

### Passo a passo

1. `deriveColumns` e `placeItem` puros com `buildCanonicalFlow()`.
2. `board_service` monta o `BoardView` (itens abertos + fechados dos últimos 7 dias, NodeRuns por item de #{ENG-09},
   custo por item de #{RT-05}, PR do artefato `pr_url`).
3. Página com colunas (300 px, rolagem horizontal), cards e atualização por eventos (`node_run.updated`, `work_item.*`).

### Notas de design

Card: título (2 linhas), `#42` em mono, etapa atual com `StatusBadge` pequeno ("Dev · rodando"), custo à direita, ícone de PR
quando houver. Colunas com contador no cabeçalho. A coluna "Precisa de humano" tem cabeçalho em `--status-waiting-approval`.

## Critérios de aceite

- [ ] O fluxo canônico gera as colunas Backlog, Bloqueado, Especificar, Desenvolver, Revisar e abrir PR, Precisa de humano, Concluído.
- [ ] Um item com o Dev rodando aparece em "Desenvolver" com estado "rodando" e atualiza sem recarregar.
- [ ] Item que saiu pelo `exhausted` do loop aparece em "Precisa de humano".
- [ ] Item bloqueado aparece em "Bloqueado".
- [ ] "Sincronizar" chama o sync e atualiza o board.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `board_columns.test.ts`: colunas e posicionamento por regra.
- `board_service.test.ts`: montagem com fakes.
- `board_view.test.tsx`: render e atualização por evento.
