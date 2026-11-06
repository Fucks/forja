---
key: ENG-07
title: "Orçamentos de tokens e custo por run, nó e dia"
type: issue
milestone: "Fase 5 — Motor de execução"
labels: [tipo:feature, area:motor]
depends_on: [ENG-06]
---

## Contexto

Atende RF-RUN-07 e RNF-CUS-01. Agentes paralelos consomem a quota várias vezes mais rápido e nenhum harness tem teto
por tarefa (benchmark, "Dores"). A Forja avalia o orçamento **antes** de iniciar cada NodeRun de agente: se o gasto
acumulado já passou do teto, o NodeRun não começa e a run pausa (padrão), falha ou pede aprovação.

## Objetivo

O scheduler recebe o uso de cada NodeRun concluído, acumula por run, por nó e por dia, e bloqueia novos inícios quando
um teto é atingido, aplicando a ação configurada.

## Escopo

**Inclui:** `budgets.ts` puro, configuração de orçamento na run (`RunBudget`), evento de uso no scheduler, ação ao estourar.
**Não inclui:** preço por modelo e registro persistido de uso (#{RT-05}); o scheduler recebe `costUsd` já calculado.

## Especificação técnica

### Arquivos

Criar:

- `src/engine/budgets.ts`
- `src/engine/budgets.test.ts`
  Alterar:
- `src/engine/scheduler_types.ts`
- `src/engine/scheduler.ts`
- `src/engine/scheduler.test.ts`

### Contratos

```ts
export interface BudgetLimit {
    maxCostUsd?: number;
    maxTokens?: number;
}
export interface RunBudget {
    run?: BudgetLimit;
    perNode?: Record<string, BudgetLimit>;
    daily?: BudgetLimit & { alreadySpentUsd: number; alreadySpentTokens: number };
    onExceeded: "pause" | "fail";
}
export interface UsageTotals {
    costUsd: number;
    tokens: number;
} // tokens = input + output (cache não conta)
export function checkBudget(
    budget: RunBudget,
    totals: { run: UsageTotals; byNode: Record<string, UsageTotals>; today: UsageTotals },
    nodeId: string,
): { allowed: true } | { allowed: false; scope: "run" | "node" | "daily"; limit: BudgetLimit };

// SchedulerOptions ganha `budget?: RunBudget`
// novo SchedulerEvent: { type: "usage_recorded"; nodeRunId: string; costUsd: number; tokens: number; at: Date }
// novo SchedulerEvent: { type: "budget_raised"; budget: RunBudget; at: Date } // usuário aumentou o teto e retoma
```

### Semântica

- Antes de mover um NodeRun de agente de QUEUED para RUNNING, `checkBudget`. Negado com `pause`: a run vai para
  `PAUSED` com `pauseReason: "budget"`, nada novo começa, os RUNNING terminam normalmente. Com `fail`: o NodeRun vira
  `FAILED` (`kind: "budget"`) sem retentativa e a política de falha normal se aplica.
- `usage_recorded` pode chegar antes do `node_run_succeeded` do mesmo NodeRun; acumule de qualquer forma.
- `budget_raised` + run `PAUSED` por orçamento → volta a `RUNNING` e reavalia a fila. Retomada manual por usuário
  (#{ENG-12}) sem aumentar o teto pausa de novo no próximo início.
- O orçamento diário vem de `ProjectSettings.dailyBudgetUsd` (#{CFG-05}); o gasto do dia é informado pelo executor ao criar o scheduler.

### Passo a passo

1. `checkBudget` puro com testes.
2. Integração no scheduler (acúmulo, bloqueio, pausa, retomada por `budget_raised`).

## Critérios de aceite

- [ ] Com `run.maxCostUsd: 1` e cada agente custando 0,40, o 4º agente não começa e a run pausa com `budget`.
- [ ] Teto por nó bloqueia só aquele nó; outros nós seguem.
- [ ] `onExceeded: "fail"` falha o NodeRun com `kind: "budget"` sem nova tentativa.
- [ ] `budget_raised` retoma a run pausada.
- [ ] NodeRuns já RUNNING no momento do bloqueio terminam normalmente.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `budgets.test.ts`: cada escopo, tokens e custo, limites ausentes.
- `scheduler.test.ts`: cenários acima no harness.
