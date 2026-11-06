---
key: OBS-01
title: "Execução ao vivo no canvas"
type: issue
milestone: "Fase 7 — Execução ao vivo e logs"
labels: [tipo:feature, area:execucao-ao-vivo]
depends_on: [EDT-09, ENG-12]
---

## Contexto

Atende RF-OBS-01 — o diferencial que o usuário pediu: "de forma visual ver em qual nó do fluxo o processo está
rodando". A tela da run (`/projects/:projectId/runs/:runId`) mostra o grafo **da versão da run** (somente leitura) com o
estado de cada nó, os contadores dos maps ("2 rodando · 1 na fila · 4 feitos"), o item atual e arestas animadas. Carrega o
`RunView` (#{ENG-12}) e aplica os eventos SSE (#{F-06}) a partir do `lastEventId`.

## Objetivo

A página da run renderiza o canvas em modo execução e atualiza estados em menos de 500 ms após cada evento, com uma barra
de controle da run (pausar, retomar, cancelar) e o motivo de pausa visível.

## Escopo

**Inclui:** `run_view_model` puro (NodeRuns → estado por nó), hook de run ao vivo, canvas somente leitura com
`NodeLiveContext` (#{EDT-02}), barra da run, seleção de item para filtrar o canvas.
**Não inclui:** drawer do nó (#{OBS-02}), logs (#{OBS-03}).

## Especificação técnica

### Arquivos

Criar:

- `src/web/canvas/live/run_view_model.ts`
- `src/web/canvas/live/use_live_run.ts`
- `src/web/canvas/live/run_canvas.tsx`
- `src/web/canvas/live/run_control_bar.tsx`
- `src/web/canvas/live/run_view_model.test.ts`
- `src/web/canvas/live/use_live_run.test.tsx`
- `src/web/canvas/live/run_canvas.test.tsx`
  Alterar:
- `src/web/app/runs/run_page.tsx` (substituir o placeholder)
- `src/web/canvas/flow_canvas.tsx` (prop `readOnly`: sem paleta, sem arrastar, sem conectar)

### Contratos

```ts
export interface NodeAggregate {
    status: ExecutionStatus;
    running: number;
    queued: number;
    succeeded: number;
    failed: number;
    currentItems: string[];
}
export function aggregateNodeStates(
    view: RunView,
    filterItemId?: string,
): Map<string, NodeLiveState>;
// status do nó: RUNNING se algum NodeRun RUNNING; senão WAITING_LIMIT/WAITING_APPROVAL; senão QUEUED; senão FAILED se o último falhou;
// SUCCEEDED se todos os itens concluíram; PENDING caso contrário. badge: "item #42" (um) ou "3 itens" (vários)
export function applyEvent(view: RunView, envelope: EventEnvelope): RunView; // node_run.updated, group.progress, run.*
export function flowingEdges(view: RunView): Set<string>; // arestas cujo destino tem NodeRun RUNNING para um item cujo NodeRun de origem acabou de concluir
export function useLiveRun(runId: string): { view?: RunView; connected: boolean; error?: ApiError };
```

Ao reconectar o SSE, se o `Last-Event-ID` não está mais no buffer do servidor, recarregue o `RunView`.

### Passo a passo

1. `run_view_model.ts` puro com testes (estado agregado, filtro por item, aplicação de eventos).
2. `useLiveRun`: query do `RunView` + `useEventStream({ runId })` aplicando eventos.
3. `RunCanvas`: `FlowCanvas readOnly` dentro de `NodeLiveContext.Provider`.
4. `RunControlBar`: status da run (StatusBadge), fluxo e versão ("Fábrica básica · v4"), duração, botões pausar/retomar/cancelar
   (cancelar pede confirmação), motivo de pausa ("Pausada por limite de uso — retoma às 15:05") e, se pausada por orçamento,
   botão "Aumentar orçamento".
5. Seletor de item ("Todos" ou um item) que filtra o estado mostrado.

### Notas de design

Superfície canvas em modo execução: fundo igual ao editor, nós não editáveis, cursor padrão. Nó rodando com o brilho
`ember`; grupos com contadores no rótulo. A barra fica no topo, densa, com o estado sempre legível. Respeite reduced motion.

## Critérios de aceite

- [ ] Abrir uma run em andamento mostra os nós com o estado atual e os contadores dos maps.
- [ ] Um `node_run.updated` RUNNING faz o nó brilhar em menos de 500 ms (teste com evento simulado).
- [ ] Filtrar pelo item #42 mostra só o estado daquele item.
- [ ] Pausar/retomar/cancelar chamam a API e a barra reflete o novo estado.
- [ ] Run pausada por limite mostra o horário de retomada.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `run_view_model.test.ts`: agregação, filtro, eventos, arestas ativas.
- `use_live_run.test.tsx`: carga + eventos + recarga ao perder o buffer.
- `run_canvas.test.tsx`: renderização com estados.
