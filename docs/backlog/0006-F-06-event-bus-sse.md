---
key: F-06
title: "EventBus tipado e stream SSE /api/events"
type: issue
milestone: "Fase 0 — Fundação"
labels: [tipo:infra, area:fundacao]
depends_on: [F-03, F-05]
---

## Contexto

A execução ao vivo (RF-OBS-01) e os gatilhos por evento (RF-TRG-01) dependem de um barramento de eventos único.
Para evitar que cada issue altere o catálogo de eventos (arquivo quente), esta issue cria **todos os eventos do
MVP** de uma vez em `src/shared/events.ts`, compartilhado entre servidor e SPA.

## Objetivo

Existe um `EventBus` tipado em memória e a rota `GET /api/events` que transmite eventos por SSE com reconexão
por `Last-Event-ID` e filtro por projeto/run.

## Escopo

**Inclui:** catálogo de eventos, `EventBus`, buffer circular para replay, rota SSE, heartbeat.
**Não inclui:** quem emite os eventos (cada domínio), cliente SSE na SPA (#{F-09}).

## Especificação técnica

### Arquivos

Criar:

- `src/shared/events.ts`
- `src/server/runtime/event_bus.ts`
- `src/server/events/events_routes.ts`
- `src/server/runtime/event_bus.test.ts`
- `src/server/events/events_routes.test.ts`
  Alterar:
- `src/server/app.ts` (`AppDeps` ganha `events: EventBus`)
- `src/server/main.ts`
- (o arquivo `*_routes.ts` desta issue já existe como stub criado em #{F-03}: substitua o conteúdo; **não** altere `src/server/route_modules.ts`)

### Contratos

```ts
// src/shared/events.ts
export const RUN_STATUS_NAMES = [
    "QUEUED",
    "RUNNING",
    "PAUSED",
    "SUCCEEDED",
    "FAILED",
    "CANCELED",
] as const;
export const NODE_RUN_STATUS_NAMES = [
    "PENDING",
    "QUEUED",
    "RUNNING",
    "SUCCEEDED",
    "FAILED",
    "CANCELED",
    "SKIPPED",
    "WAITING_APPROVAL",
    "WAITING_LIMIT",
    "INTERRUPTED",
] as const;
export type RunStatusName = (typeof RUN_STATUS_NAMES)[number];
export type NodeRunStatusName = (typeof NODE_RUN_STATUS_NAMES)[number];

export type ForjaEvent =
    | {
          type: "run.created" | "run.started" | "run.finished";
          runId: string;
          projectId: string;
          flowId: string;
          status: RunStatusName;
      }
    | {
          type: "run.paused";
          runId: string;
          projectId: string;
          reason: "user" | "usage_limit" | "budget";
          resumeAt?: string;
      }
    | { type: "run.resumed"; runId: string; projectId: string }
    | {
          type: "node_run.updated";
          runId: string;
          projectId: string;
          nodeRunId: string;
          nodeId: string;
          workItemId?: string;
          status: NodeRunStatusName;
          attempt: number;
          iteration: number;
      }
    | {
          type: "group.progress";
          runId: string;
          projectId: string;
          groupId: string;
          queued: number;
          running: number;
          succeeded: number;
          failed: number;
      }
    | {
          type: "log.appended";
          runId: string;
          projectId: string;
          nodeRunId: string;
          fromSeq: number;
          toSeq: number;
      }
    | {
          type: "usage.recorded";
          runId: string;
          projectId: string;
          nodeRunId: string;
          inputTokens: number;
          outputTokens: number;
          costUsd: number;
      }
    | { type: "usage.limit_reached"; projectId: string; runId?: string; resetAt?: string }
    | { type: "usage.limit_reset"; projectId: string }
    | { type: "work_item.created" | "work_item.updated"; projectId: string; workItemId: string }
    | {
          type: "approval.requested" | "approval.resolved";
          projectId: string;
          approvalId: string;
          runId: string;
      }
    | {
          type: "trigger.fired";
          projectId: string;
          triggerId: string;
          runId?: string;
          skipped?: boolean;
      }
    | { type: "flow.published"; projectId: string; flowId: string; version: number };
export type ForjaEventType = ForjaEvent["type"];
export interface EventEnvelope {
    id: number;
    at: string;
    event: ForjaEvent;
}

// src/server/runtime/event_bus.ts
export interface EventBus {
    publish(event: ForjaEvent): EventEnvelope;
    subscribe(listener: (envelope: EventEnvelope) => void): () => void;
    since(lastId: number): EventEnvelope[]; // do buffer (últimos 5000)
}
export function createEventBus(clock: { now(): Date }): EventBus;
```

Use o tipo estrutural `{ now(): Date }` para não depender de #{F-07}.

SSE `GET /api/events?projectId=&runId=`: `content-type: text/event-stream`; cada envelope vira `id:`,
`event: <type>`, `data: <json>`; ao conectar reenvia `since(Last-Event-ID)`; comentário `: ping` a cada 15 s;
remove o listener ao fechar.

### Passo a passo

1. Escreva o catálogo exatamente como acima (as outras issues só consomem).
2. Implemente o bus com ids crescentes e buffer circular; listener que lança não derruba os outros.
3. Implemente a rota SSE com filtros e heartbeat (intervalo injetável para o teste).

## Critérios de aceite

- [ ] Assinantes recebem eventos na ordem; cancelar a assinatura para a entrega.
- [ ] Reconexão com `Last-Event-ID: 10` recebe os eventos 11+ ainda no buffer.
- [ ] Filtro `runId` entrega só eventos daquela run; filtro `projectId` só do projeto.
- [ ] Fechar a conexão remove o listener.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `event_bus.test.ts`: ordem, unsubscribe, listener que lança, buffer circular (o 5001º descarta o 1º), `since`.
- `events_routes.test.ts`: servidor em porta efêmera e cliente lendo o stream; replay por `Last-Event-ID`; filtros.
