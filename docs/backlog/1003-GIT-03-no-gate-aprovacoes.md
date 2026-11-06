---
key: GIT-03
title: "Nó gate e aprovações humanas (backend)"
type: issue
milestone: "Fase 10 — Git, gates e PR"
labels: [tipo:feature, area:git]
depends_on: [GIT-01]
---

## Contexto

Atende RF-RUN-05 e a regra "nada destrutivo sem gate". Um nó `gate` pausa o item até um humano aprovar ou rejeitar, vendo
o diff do branch, artefatos e logs. Saída `approved` ou `rejected` segue por portas diferentes (ex.: rejeitado volta ao Dev
com o comentário, ou vai para "Precisa de humano").

## Objetivo

O executor do `gate` cria uma `Approval`, deixa o NodeRun em `WAITING_APPROVAL` sem ocupar vaga de agente, e a API de
aprovações resolve o pedido, continuando o fluxo pela porta certa com o comentário como dado.

## Escopo

**Inclui:** tabela `approvals`, service, rotas, executor do gate, evento no scheduler `approval_resolved`, timeout opcional, diff no pedido.
**Não inclui:** tela (#{GIT-04}).

## Especificação técnica

### Arquivos

Criar:

- `src/shared/approval_types.ts`
- `src/server/db/migrations/0900_approvals.sql`
- `src/server/db/schema/approvals.ts`
- `src/server/approvals/approval_repository.ts`
- `src/server/approvals/approval_service.ts`
- `src/server/approvals/approval_service.test.ts`
- `src/server/approvals/approvals_routes.test.ts`
- `src/server/runtime/executors/gate_executor.ts`
- `src/server/runtime/executors/gate_executor.test.ts`
  Alterar:
- `src/server/approvals/approvals_routes.ts` (substituir o stub de #{F-03})
- `src/server/runtime/node_executors.ts`
- `src/engine/scheduler_types.ts`, `src/engine/scheduler.ts`, `src/engine/scheduler.test.ts` (estado `WAITING_APPROVAL` não conta no teto; evento `approval_resolved`; timeout → `rejected` com comentário "tempo esgotado")
- `src/server/runtime/executor.ts` (executor de gate devolve "aguardando" em vez de resultado: contrato `NodeExecutionResult | { waiting: "approval"; approvalId: string }`)

### Contratos

```ts
export interface Approval {
    id: string;
    projectId: string;
    runId: string;
    nodeRunId: string;
    workItemId?: string;
    message: string;
    show: ("diff" | "artifacts" | "logs")[];
    diff?: string;
    status: "pending" | "approved" | "rejected" | "expired";
    comment?: string;
    createdAt: string;
    resolvedAt?: string;
    expiresAt?: string;
}
export interface ApprovalService {
    create(input: Omit<Approval, "id" | "status" | "createdAt">): Promise<Approval>;
    resolve(id: string, decision: "approved" | "rejected", comment?: string): Promise<Approval>; // 409 se não pendente
    listPending(projectId: string): Promise<Approval[]>;
    get(id: string): Promise<Approval>;
}
// novo SchedulerEvent: { type: "approval_resolved"; nodeRunId: string; decision: "approved" | "rejected"; comment?: string; at: Date }
```

- Saídas do gate: `approved` ou `rejected` recebem o item; o comentário fica em `outputs.comment` (acessível a jusante como `{{inputs.comment}}` se ligado).
- `diff` capturado com `workspace.diff(base)` ao criar (truncado em 200 KB).
- Eventos `approval.requested` / `approval.resolved` publicados; auditoria em #{QA-03}.
- Rotas: `GET /api/projects/:projectId/approvals?status=pending`, `GET /api/approvals/:id`, `POST /api/approvals/:id/resolve`.
- Reinício com gate pendente: o NodeRun continua `WAITING_APPROVAL` (não é `RUNNING`, então #{ENG-11} não o interrompe).

### Passo a passo

1. Migração, repositório, service, rotas.
2. Scheduler: estado de espera, evento, timeout via `schedule_wakeup`.
3. Executor do gate e contrato "aguardando" no executor.

## Critérios de aceite

- [ ] O gate cria a aprovação com diff e o NodeRun fica `WAITING_APPROVAL` sem ocupar vaga de agente.
- [ ] Aprovar continua pela porta `approved`; rejeitar pela `rejected` com o comentário.
- [ ] Resolver duas vezes → 409.
- [ ] Timeout configurado rejeita automaticamente com "tempo esgotado".
- [ ] Gate pendente sobrevive a reinício.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `approval_service.test.ts`, `approvals_routes.test.ts`, `gate_executor.test.ts`, cenários no `scheduler.test.ts`.
