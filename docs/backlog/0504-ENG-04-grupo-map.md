---
key: ENG-04
title: "Executar grupo map com concorrência configurável"
type: issue
milestone: "Fase 5 — Motor de execução"
labels: [tipo:feature, area:motor]
depends_on: [ENG-03]
---

## Contexto

Atende RF-RUN-02. Com #{ENG-03} o scheduler executa um DAG por item com teto global. Falta o primitivo que é o
coração do template padrão: "TL ×1 → Dev ×3 → Reviewer ×1" — executar o subgrafo de um grupo `map` uma vez por item,
com no máximo `concurrency` itens ao mesmo tempo e o resto em fila visível, e encadear maps com arestas
correlacionadas por item (PRD, "Map"). A pesquisa mostrou que nenhum concorrente mostra essa fila; o canvas
(#{OBS-01}) vai ler os contadores emitidos aqui.

## Objetivo

Existe `map_group.ts` puro e testado que, integrado ao scheduler, executa o subgrafo de um map por item com
concorrência limitada, ordem de saída estável, streaming ou barreira, `failFast` opcional e encadeamento entre maps.

## Escopo

**Inclui:** estado do map, integração no `scheduler.ts`, entrada por lista ou por correlação, eventos `group_progress`.
**Não inclui:** loop (#{ENG-05}), retentativas e timeouts (#{ENG-06}), visual (#{OBS-01}).

## Especificação técnica

### Arquivos

Criar:

- `src/engine/map_group.ts`
- `src/engine/map_group.test.ts`
  Alterar:
- `src/engine/scheduler.ts`
- `src/engine/scheduler.test.ts`

### Contratos

```ts
export interface MapGroupState {
    groupId: string;
    concurrency: number;
    barrier: boolean;
    failFast: boolean;
    items: {
        itemId: string;
        status: "waiting" | "queued" | "running" | "succeeded" | "failed" | "canceled";
    }[];
    inputClosed: boolean; // true quando não chegarão mais itens (lista recebida, ou map anterior concluído)
}
export function createMapGroupState(group: FlowGroup & { kind: "map" }): MapGroupState;
export function addItems(state: MapGroupState, itemIds: string[]): MapGroupState; // lista ou itens correlacionados chegando
export function closeInput(state: MapGroupState): MapGroupState;
export function itemsToStart(state: MapGroupState): string[]; // respeita concurrency (não o teto global)
export function onItemFinished(
    state: MapGroupState,
    itemId: string,
    result: "succeeded" | "failed",
): MapGroupState;
export function isMapDone(state: MapGroupState): boolean; // inputClosed e todos terminais
export function mapProgress(state: MapGroupState): {
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
};
```

### Semântica

- "Rodando" num map = o item tem ao menos um NodeRun não terminal dentro do subgrafo. No máximo `concurrency` itens
  rodando no grupo **e** o teto global de agentes continua valendo dentro do item.
- Ordem de início FIFO pela chegada do item. Saída da lista do grupo (para quem consome `workItemList` a jusante): ordem
  de entrada, nunca de término.
- Entrada por **lista**: ao chegar a `workItemList`, `addItems` + `closeInput`. Entrada por **correlação** (maps
  irmãos): cada item que concluiu o map A com sucesso é adicionado ao map B; `closeInput` em B quando A termina.
- `barrier: false` (padrão): cada item concluído libera imediatamente os nós a jusante daquele item. `barrier: true`:
  nada a jusante do grupo começa antes de `isMapDone`.
- Item falho: os outros continuam; itens falhos não seguem para o map seguinte; a run termina `SUCCEEDED` se ao menos
  os itens restantes concluíram e nenhum nó fora de grupos falhou (registre `failedItems` no RunState). `failFast:
true`: itens `queued` viram `canceled` e os `running` recebem `cancel_node_run`.
- Lista vazia: grupo conclui com `[]`; nós a jusante que dependem só do map são `SKIPPED`.
- Cada mudança emite `group_progress`.

### Passo a passo

1. Funções puras de `map_group.ts` sem I/O.
2. No scheduler: ao detectar entrada em um nó com `parentGroupId` de map, criar/usar o `MapGroupState`; um item só
   pode ter NodeRuns no subgrafo depois que `itemsToStart` o liberar.
3. Encadeamento por correlação usando `isItemCorrelatedEdge` de #{FLW-02}.
4. `barrier` e `failFast`.
5. Testes com `scheduler_harness` e `FakeAgentRuntime` roteirizado (durações diferentes por item).

## Critérios de aceite

- [ ] Map com `concurrency: 3` e 5 itens nunca tem mais de 3 itens rodando; os 2 restantes começam à medida que vagas abrem.
- [ ] Com teto global 2 e `concurrency: 3`, no máximo 2 agentes executam.
- [ ] Saída do map preserva a ordem de entrada mesmo quando os itens terminam fora de ordem.
- [ ] `map(TL,1) → map(Dev,3) → map(Reviewer,1)` em streaming: o Reviewer começa no primeiro item que o Dev concluir e nunca roda dois ao mesmo tempo; o Dev recebe o `spec` do TL do mesmo item.
- [ ] Com `barrier: true`, nada a jusante começa antes de todos os itens terminarem.
- [ ] Falha de um item não interrompe os demais e ele não segue para o map seguinte; com `failFast`, a fila vira `canceled`.
- [ ] Lista vazia conclui o grupo com `[]`.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `map_group.test.ts`: `itemsToStart` com combinações; ordem; lista vazia; failFast; contadores.
- `scheduler.test.ts`: fluxo canônico (`buildCanonicalFlow`) com 5 itens no `FakeAgentRuntime` (durações do Dev 30 s,
  10 s, 50 s, 20 s, 40 s no `FakeClock`): verificar a linha do tempo de início/fim de cada NodeRun, o pico de
  concorrência por grupo, a correlação do `spec` e a ordem da saída final.
