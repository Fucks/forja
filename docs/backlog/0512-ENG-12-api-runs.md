---
key: ENG-12
title: "API de runs: iniciar, pausar, retomar, cancelar e repetir"
type: issue
milestone: "Fase 5 — Motor de execução"
labels: [tipo:feature, area:motor]
depends_on: [ENG-11]
---

## Contexto
Atende RF-RUN-01. Canvas ao vivo (#{OBS-01}), histórico (#{OBS-04}), board (#{BRD-05}) e gatilhos (#{TRG-01}) usam
esta API sobre o executor (#{ENG-10}). A run é sempre de uma versão publicada.

## Objetivo
Existe `run_service` e a API REST de runs e NodeRuns, com validação, paginação e um "estado completo da run" que a tela ao
vivo carrega antes de assinar os eventos.

## Escopo
**Inclui:** service, rotas, `RunView` (run + NodeRuns + progresso dos grupos), erros de domínio.
**Não inclui:** logs (#{RT-03}), uso (#{RT-05}).

## Especificação técnica
### Arquivos
Criar:
- `src/shared/run_types.ts`
- `src/server/runs/run_service.ts`
- `src/server/runs/run_view.ts`
- `src/server/runs/run_service.test.ts`
- `src/server/runs/runs_routes.test.ts`
Alterar:
- `src/server/runs/runs_routes.ts` (substituir o stub de #{F-03})

### Contratos
```ts
export interface RunView {
    run: RunRecord & { flowName: string };
    nodeRuns: NodeRunState[];
    groups: Record<string, { queued: number; running: number; succeeded: number; failed: number }>;
    graph: FlowGraph;                // da versão da run
    lastEventId: number;             // para reconectar o SSE sem perder eventos
}
export function buildRunView(run: RunRecord, nodeRuns: NodeRunState[], graph: FlowGraph, flowName: string, lastEventId: number): RunView; // progresso derivado dos NodeRuns
export const startRunInput = z.object({ flowId: z.string(), version: z.number().int().optional(), itemIds: z.array(z.string()).max(100).default([]) });
```
Rotas:
- `POST /api/projects/:projectId/runs` (`startRunInput`) → 201 `RunRecord`; fluxo sem versão publicada → 422.
- `GET /api/projects/:projectId/runs?limit=&before=&flowId=&status=` → lista.
- `GET /api/runs/:runId` → `RunView`.
- `POST /api/runs/:runId/{pause,resume,cancel}`; transição inválida → 409.
- `POST /api/node-runs/:nodeRunId/{cancel,retry}`.
- `GET /api/node-runs/:nodeRunId` → NodeRun + artefatos.
- `POST /api/runs/:runId/budget` `{ run?: BudgetLimit }` → evento `budget_raised` (#{ENG-07}).

### Passo a passo
1. Tipos compartilhados (`RunRecord`, `NodeRunState`, `RunView` serializados com datas ISO).
2. `buildRunView` puro.
3. Service sobre `Executor` + `RunRepository` + `FlowService`.
4. Rotas e testes com `app.inject` e executor com `FakeAgentRuntime`.

## Critérios de aceite
- [ ] Iniciar run de fluxo publicado devolve 201 e a run aparece em `GET /runs`.
- [ ] Fluxo sem versão publicada → 422 com mensagem "Publique o fluxo antes de executar".
- [ ] Pausar run terminal → 409.
- [ ] `RunView` traz o grafo da versão da run (não o rascunho) e o progresso dos maps.
- [ ] Repetir um NodeRun falho reabre a run.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `run_service.test.ts`: iniciar, transições, repetir, aumentar orçamento.
- `runs_routes.test.ts`: status codes, paginação, formato do `RunView`.
