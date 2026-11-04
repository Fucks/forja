---
key: ENG-06
title: "Retentativas, timeouts e cancelamento de NodeRuns"
type: issue
milestone: "Fase 5 — Motor de execução"
labels: [tipo:feature, area:motor]
depends_on: [ENG-05, ENG-01]
---

## Contexto
Atende RF-RUN-01 e RF-RUN-04. Agentes falham por motivos diferentes e a política precisa ser explícita: saída
estruturada inválida merece nova tentativa; timeout por inatividade (agente travado sem eventos) também; erro de
workspace (Docker parado) não adianta repetir imediatamente; cancelamento nunca é repetido; limite de uso é pausa,
não falha (#{ENG-08}). Os tipos de erro vêm do `AgentRuntime` (#{ENG-01}).

## Objetivo
O scheduler aplica retentativas com backoff por tipo de erro, cria um novo NodeRun por tentativa, aplica o timeout total
do nó, permite cancelar e repetir um NodeRun específico, e as regras ficam numa política pura testada.

## Escopo
**Inclui:** `retry_policy.ts`, timeout total via `schedule_wakeup`, eventos `cancel_node_run_requested` e `retry_node_run_requested`.
**Não inclui:** timeout por inatividade (aplicado pelo runtime via `idleTimeoutSeconds`, #{RT-02}; aqui só a política quando ele ocorre).

## Especificação técnica
### Arquivos
Criar:
- `src/engine/retry_policy.ts`
- `src/engine/retry_policy.test.ts`
Alterar:
- `src/engine/run_state.ts` e `src/engine/run_state.test.ts` (transições de reabertura)
- `src/engine/scheduler_types.ts` (novos eventos)
- `src/engine/scheduler.ts`
- `src/engine/scheduler.test.ts`

### Contratos
```ts
export type FailureKind = NonNullable<NodeRunState["error"]>["kind"];
export interface RetryDecision { retry: boolean; delayMs: number; countsAsAttempt: boolean }
export function decideRetry(kind: FailureKind, attempt: number, maxRetries: number): RetryDecision;
// structured_output, timeout_idle, timeout_total, runtime → retry se attempt <= maxRetries; delay 30 s × 2^(attempt-1), máx. 10 min
// workspace → retry com delay 2 min (máx. 2 vezes, independente de maxRetries)
// canceled, budget → nunca; usage_limit e interrupted → tratados em #{ENG-08} e #{ENG-11} (countsAsAttempt: false)

// novos SchedulerEvent
| { type: "cancel_node_run_requested"; nodeRunId: string; at: Date }
| { type: "retry_node_run_requested"; nodeRunId: string; at: Date } // só para NodeRun FAILED/CANCELED de run ainda não terminal, ou reabre a run (ver semântica)
```

### Semântica
- Falha com `retry: true`: o NodeRun fica `FAILED` (histórico preservado) e um novo NodeRun com `attempt + 1` nasce
  `QUEUED` com `queuedAt = at + delayMs` (o scheduler só o inicia depois, via `schedule_wakeup`).
- Timeout total: ao iniciar um agente, o scheduler agenda `schedule_wakeup` em `startedAt + timeoutMinutes`; no `tick`,
  se ainda RUNNING, emite `cancel_node_run` e trata a confirmação como `timeout_total`.
- Cancelar um NodeRun: RUNNING → `cancel_node_run`; QUEUED → CANCELED. Num map, cancelar o NodeRun de um item faz o
  item falhar (os outros seguem). Fora de grupos, cancela a run inteira.
- Repetir um NodeRun (`retry_node_run_requested`) de uma run `FAILED`/`SUCCEEDED`: a run volta para `RUNNING`
  (transições novas `FAILED → RUNNING` e `SUCCEEDED → RUNNING`, acrescentadas em `src/engine/run_state.ts` por esta
  issue), o NodeRun é recriado com `attempt + 1` e os nós a jusante daquele item que estavam SKIPPED/FAILED são recalculados.

### Passo a passo
1. `decideRetry` com tabela e testes.
2. Integração no scheduler: falhas, delays, timeout total, cancelar, repetir.
3. Atualize `run_state.ts` e seus testes com as transições de reabertura.

## Critérios de aceite
- [ ] Saída estruturada inválida com `retries: 1` gera 2 NodeRuns (attempt 1 FAILED, attempt 2) com 30 s entre eles.
- [ ] Erro `workspace` repete após 2 min até 2 vezes, mesmo com `retries: 0`.
- [ ] Agente que excede `timeoutMinutes` é cancelado e registrado como `timeout_total`.
- [ ] Cancelar o NodeRun de um item dentro do map falha só aquele item.
- [ ] Repetir o Reviewer de uma run concluída reabre a run e executa só o necessário para aquele item.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `retry_policy.test.ts`: matriz tipo × tentativa.
- `scheduler.test.ts`: cada critério com `FakeAgentRuntime` e `FakeClock`.
