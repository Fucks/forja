---
key: ENG-02
title: "Máquinas de estado de Run e NodeRun"
type: issue
milestone: "Fase 5 — Motor de execução"
labels: [tipo:feature, area:motor]
depends_on: [FLW-01]
---

## Contexto

O PRD ("Máquinas de estado") define os estados de `Run` e `NodeRun`. Todo o resto — scheduler, banco, canvas ao vivo,
board — depende dessas transições serem únicas e testadas. Funções puras em `src/engine/`.

## Objetivo

Existem `canTransitionRun`, `canTransitionNodeRun`, os tipos `RunState`/`NodeRunState` e as funções de transição que
recusam mudanças inválidas com erro claro.

## Escopo

**Inclui:** tipos de estado, tabela de transições, funções `transitionRun`/`transitionNodeRun`, estados terminais.
**Não inclui:** quem dispara as transições (#{ENG-03} em diante), persistência (#{ENG-09}).

## Especificação técnica

### Arquivos

Criar:

- `src/engine/run_state.ts`
- `src/engine/node_run_state.ts`
- `src/engine/run_state.test.ts`
- `src/engine/node_run_state.test.ts`

### Contratos

```ts
import type { RunStatusName, NodeRunStatusName } from "@/shared/events";
export interface RunState {
    id: string;
    projectId: string;
    flowId: string;
    flowVersion: number;
    status: RunStatusName;
    pauseReason?: "user" | "usage_limit" | "budget";
    resumeAt?: Date;
    createdAt: Date;
    startedAt?: Date;
    finishedAt?: Date;
    error?: string;
}
export interface NodeRunState {
    id: string;
    runId: string;
    nodeId: string;
    workItemId?: string;
    iteration: number;
    attempt: number; // iteration do loop mais interno (0 fora de loop); attempt começa em 1
    groupPath: { groupId: string; iteration?: number }[]; // contexto dentro de grupos aninhados
    status: NodeRunStatusName;
    queuedAt?: Date;
    startedAt?: Date;
    finishedAt?: Date;
    error?: {
        kind:
            | "usage_limit"
            | "timeout_total"
            | "timeout_idle"
            | "structured_output"
            | "runtime"
            | "workspace"
            | "budget"
            | "canceled"
            | "interrupted";
        message: string;
    };
    inputs?: Record<string, unknown>; // gravadas no start_node_run (máx. 256 KB; acima disso { truncated: true })
    outputs?: Record<string, unknown>;
}
export const RUN_TERMINAL: ReadonlySet<RunStatusName>; // SUCCEEDED, FAILED, CANCELED
export const NODE_RUN_TERMINAL: ReadonlySet<NodeRunStatusName>; // SUCCEEDED, FAILED, CANCELED, SKIPPED
export function canTransitionRun(from: RunStatusName, to: RunStatusName): boolean;
export function canTransitionNodeRun(from: NodeRunStatusName, to: NodeRunStatusName): boolean;
export function transitionRun(
    run: RunState,
    to: RunStatusName,
    at: Date,
    extra?: Partial<RunState>,
): RunState; // lança InvalidTransitionError
export function transitionNodeRun(
    nr: NodeRunState,
    to: NodeRunStatusName,
    at: Date,
    extra?: Partial<NodeRunState>,
): NodeRunState;
```

Transições de Run: `QUEUED→RUNNING|CANCELED`, `RUNNING→PAUSED|SUCCEEDED|FAILED|CANCELED`, `PAUSED→RUNNING|CANCELED`.
Transições de NodeRun: `PENDING→QUEUED|SKIPPED|CANCELED`, `QUEUED→RUNNING|CANCELED|SKIPPED`,
`RUNNING→SUCCEEDED|FAILED|CANCELED|WAITING_APPROVAL|WAITING_LIMIT|INTERRUPTED`,
`WAITING_APPROVAL→SUCCEEDED|FAILED|CANCELED`, `WAITING_LIMIT→QUEUED|CANCELED`, `INTERRUPTED→QUEUED|CANCELED`.
Timestamps: `queuedAt` ao entrar em QUEUED, `startedAt` em RUNNING, `finishedAt` em terminal.

### Passo a passo

1. Tabelas como `Record<From, To[]>`; funções puras.
2. Testes exaustivos: para cada par (from, to), verificar o resultado esperado.

## Critérios de aceite

- [ ] Todas as transições válidas listadas passam; qualquer outra lança `InvalidTransitionError` com from/to na mensagem.
- [ ] Estados terminais não saem para nenhum outro estado.
- [ ] Timestamps são preenchidos nas transições corretas.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `run_state.test.ts` e `node_run_state.test.ts`: matriz completa de pares, timestamps, `extra` aplicado.
