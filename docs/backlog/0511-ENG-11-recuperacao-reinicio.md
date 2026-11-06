---
key: ENG-11
title: "Recuperação de runs após reinício do servidor"
type: issue
milestone: "Fase 5 — Motor de execução"
labels: [tipo:feature, area:motor]
depends_on: [ENG-10]
---

## Contexto

Atende RF-RUN-06 e RNF-CON-01. A Forja roda AFK por horas; o PC reinicia, o processo cai, o usuário fecha o terminal.
Ao subir de novo, nenhuma run pode ficar presa em RUNNING para sempre, nenhum NodeRun pode ser duplicado em silêncio e
containers órfãos não podem continuar gastando.

## Objetivo

Na inicialização, `recoverRuns()` reconcilia runs ativas: NodeRuns `RUNNING` viram `INTERRUPTED` e voltam à fila sem
consumir tentativa, runs pausadas mantêm o `resumeAt`, o scheduler é restaurado do snapshot e workspaces órfãos são fechados.

## Escopo

**Inclui:** `recovery.ts`, restauração do scheduler (`restore` de #{ENG-03}), fechamento de workspaces órfãos, evento de scheduler `node_run_interrupted`.
**Não inclui:** retomar a sessão do Claude (`resume`) — nova tentativa começa do zero no mesmo branch (os commits ficam).

## Especificação técnica

### Arquivos

Criar:

- `src/server/runtime/recovery.ts`
- `src/server/runtime/recovery.test.ts`
  Alterar:
- `src/engine/scheduler_types.ts` e `src/engine/scheduler.ts` (evento `{ type: "node_run_interrupted"; nodeRunId; at }` → INTERRUPTED → QUEUED, `attempt` igual)
- `src/engine/scheduler.test.ts`
- `src/server/runtime/executor.ts` (`resumeFromSnapshot(run, snapshot)`)
- `src/server/main.ts` (chamar `recoverRuns()` antes de aceitar requisições)

### Contratos

```ts
export interface RecoveryReport {
    resumed: string[];
    stillPaused: string[];
    interruptedNodeRuns: string[];
    closedWorkspaces: string[];
    failed: { runId: string; reason: string }[];
}
export async function recoverRuns(deps: {
    runs: RunRepository;
    executor: Executor & { resumeFromSnapshot(run: RunRecord, snapshot: unknown): Promise<void> };
    runtime: AgentRuntime;
    clock: Clock;
    log(msg: string): void;
}): Promise<RecoveryReport>;
```

### Semântica

- Para cada run de `listActiveRuns()`: carrega o snapshot; sem snapshot ou snapshot inválido → run `FAILED` com erro
  "estado perdido no reinício" (raro; registrado no relatório).
- NodeRuns `RUNNING` no snapshot → evento `node_run_interrupted` (status `INTERRUPTED` gravado, depois `QUEUED`).
- Runs `PAUSED` por limite com `resumeAt` no passado → retomam imediatamente; no futuro → `schedule_wakeup`.
- `runtime.listOpenWorkspaces()`: workspaces cujo `runId` não está ativo → `closeWorkspace`. Workspaces de runs ativas
  também são fechados (o executor reabre sob demanda — mais simples e seguro que reaproveitar container de outro processo).
- O relatório é logado no console do servidor (`[forja] recuperação: 2 runs retomadas, 3 NodeRuns interrompidos, 1 workspace fechado`).

### Passo a passo

1. Evento no scheduler e testes.
2. `resumeFromSnapshot` no executor.
3. `recoverRuns` e chamada no boot.

## Critérios de aceite

- [ ] Run com 2 Devs RUNNING no momento da queda: após reiniciar, os 2 NodeRuns aparecem como INTERRUPTED no histórico e novos inícios ocorrem com o mesmo `attempt`.
- [ ] Run pausada por limite com `resumeAt` futuro continua pausada e retoma no horário.
- [ ] Workspaces órfãos são fechados no boot.
- [ ] Nenhum NodeRun é executado duas vezes ao mesmo tempo após a recuperação.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `recovery.test.ts`: banco de teste com runs em estados variados + `FakeAgentRuntime` com workspaces "abertos"; relatório e estados finais.
- `scheduler.test.ts`: `node_run_interrupted`.
