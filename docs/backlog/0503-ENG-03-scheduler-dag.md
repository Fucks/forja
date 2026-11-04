---
key: ENG-03
title: "Scheduler de DAG por item com concorrência global"
type: issue
milestone: "Fase 5 — Motor de execução"
labels: [tipo:feature, area:motor]
depends_on: [ENG-02, FLW-02]
---

## Contexto
Atende RF-RUN-01 e RF-RUN-07. O scheduler é o coração da Forja: decide qual `NodeRun` começa, para qual item, e
quando. Ele é um **núcleo funcional puro** — recebe eventos e devolve comandos — para ser testado à exaustão com relógio
fake; o executor (#{ENG-10}) interpreta os comandos (abrir workspace, rodar agente, gravar no banco). Bugs de
concorrência são os mais caros deste produto (PRD).

Esta issue cobre o DAG **fora de grupos** e o teto global/projeto de concorrência; map, loop, retentativas, orçamento e
limite de uso entram em #{ENG-04}…#{ENG-08}, todas estendendo este mesmo arquivo em cadeia.

## Objetivo
Existe `createScheduler(graph, options)` com `start`, `handle(event)` e `tick(now)` que, para um fluxo sem grupos,
executa os nós na ordem do DAG por item, respeitando o teto de concorrência e o intervalo mínimo entre inícios, e
conclui a run.

## Escopo
**Inclui:** estado do scheduler, prontidão por item, fila FIFO, tetos, intervalo entre inícios, propagação de saídas
pelas arestas, nós que recebem lista, conclusão da run (sucesso/falha), cancelamento simples da run.
**Não inclui:** grupos (#{ENG-04}, #{ENG-05}), retentativas/timeouts (#{ENG-06}), orçamento (#{ENG-07}), limite de uso (#{ENG-08}).

## Especificação técnica
### Arquivos
Criar:
- `src/engine/scheduler_types.ts`
- `src/engine/scheduler.ts`
- `src/engine/scheduler.test.ts`
- `src/test/factories/scheduler_harness.ts`

### Contratos
```ts
export interface SchedulerOptions { maxConcurrentAgents: number; minStartIntervalMs: number; newId(): string }
export interface WorkItemRef { id: string } // dados completos ficam fora do motor

export type SchedulerEvent =
    | { type: "start"; items: WorkItemRef[]; at: Date }
    | { type: "node_run_succeeded"; nodeRunId: string; outputs: Record<string, unknown>; at: Date }
    | { type: "node_run_failed"; nodeRunId: string; error: NodeRunState["error"]; at: Date }
    | { type: "cancel_requested"; at: Date };

export type SchedulerCommand =
    | { type: "start_node_run"; nodeRun: NodeRunState; inputs: Record<string, unknown> }
    | { type: "cancel_node_run"; nodeRunId: string }
    | { type: "node_run_changed"; nodeRun: NodeRunState }
    | { type: "run_changed"; run: RunState }
    | { type: "group_progress"; groupId: string; queued: number; running: number; succeeded: number; failed: number }
    | { type: "schedule_wakeup"; at: Date }; // o executor chama tick(at) nessa hora

export interface Scheduler {
    handle(event: SchedulerEvent): SchedulerCommand[];
    tick(now: Date): SchedulerCommand[];
    snapshot(): SchedulerSnapshot;                  // serializável (JSON) — persistido em #{ENG-09}
}
export function createScheduler(graph: FlowGraph, run: RunState, options: SchedulerOptions, restore?: SchedulerSnapshot): Scheduler;
```
Regras:
- Um `NodeRun` de nó **por item** quando o nó está no "caminho do item" (a jusante de uma aresta `workItem`/correlacionada);
  um único `NodeRun` (sem `workItemId`) quando o nó recebe `workItemList` ou não tem item (ex.: `source`).
- `trigger` produz `items` = itens do evento `start`; vira `SUCCEEDED` imediatamente (sem comando de execução).
- Um `NodeRun` vai para `QUEUED` quando todas as entradas obrigatórias **daquele item** existem; para `RUNNING` quando
  há vaga (só nós `agent` e `script` contam no teto) e já passou `minStartIntervalMs` desde o último início de agente.
  Nós não-agente (condition, output…) iniciam sem esperar vaga.
- Fila FIFO por `queuedAt`, desempate por ordem topológica e id do item.
- Ramos de `condition`: a porta não escolhida faz os nós a jusante (só daquele item) virarem `SKIPPED`.
- Run `SUCCEEDED` quando todos os NodeRuns são terminais e nenhum `FAILED` fora de map tolerante; `FAILED` quando um
  NodeRun fora de grupos falha (sem retentativa nesta issue).
- `cancel_requested`: QUEUED/PENDING → CANCELED; RUNNING → comando `cancel_node_run` (o executor confirma com `node_run_failed` kind `canceled`); run → CANCELED quando nada mais roda.
- Snapshot contém tudo para retomar (`restore`).

`scheduler_harness.ts`: liga um `Scheduler` a um `FakeAgentRuntime` e um `FakeClock` em memória (executor de teste
mínimo) e devolve a linha do tempo de NodeRuns — usado por todos os testes de motor.

### Passo a passo
1. Tipos e estado interno (mapas por id, índice por nó+item).
2. Prontidão por item usando `incomingEdges`/`topologicalOrder` de #{FLW-02}.
3. Comandos de início respeitando tetos e intervalo; `schedule_wakeup` quando há fila esperando o intervalo.
4. Propagação de saídas: `outputs[porta]` de um NodeRun alimenta as entradas ligadas do mesmo item.
5. Cancelamento e conclusão.
6. `scheduler_harness` e testes.

## Critérios de aceite
- [ ] Fluxo linear trigger → agent A → agent B com 2 itens: B do item 1 começa assim que A do item 1 termina (não espera o item 2).
- [ ] Com `maxConcurrentAgents: 2` e 5 itens, nunca há mais de 2 agentes RUNNING.
- [ ] `minStartIntervalMs: 5000` espaça os inícios em pelo menos 5 s (verificado no FakeClock).
- [ ] Condition false faz os nós do ramo true daquele item virarem SKIPPED.
- [ ] Falha de um agente fora de grupos termina a run em FAILED após os demais RUNNING concluírem.
- [ ] Cancelar a run cancela a fila e pede cancelamento dos RUNNING.
- [ ] `restore` a partir de `snapshot()` continua de onde parou.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `scheduler.test.ts` com `scheduler_harness`: cada critério acima como um cenário com linha do tempo explícita.
