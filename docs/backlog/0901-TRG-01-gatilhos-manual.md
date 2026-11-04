---
key: TRG-01
title: "Gatilhos: modelo, políticas e disparo manual"
type: issue
milestone: "Fase 9 — Gatilhos e schedules"
labels: [tipo:feature, area:gatilhos]
depends_on: [ENG-12, BRD-01]
---

## Contexto
Atende RF-TRG-01 e RF-TRG-02. Um `Trigger` liga um fluxo a uma forma de iniciá-lo: manual, cron (#{TRG-02}), evento ou
webhook (#{TRG-03}) e coluna do board (#{BRD-07}). Todos passam pelo mesmo `fire()`, que aplica a política quando já há
uma run ativa do mesmo fluxo (pular, enfileirar, paralelo) e registra o disparo.

## Objetivo
Existe o `trigger_service` com CRUD de gatilhos, `fire(triggerId, { itemIds? })` com política aplicada, histórico de
disparos e a API; o gatilho manual funciona de ponta a ponta.

## Escopo
**Inclui:** tabelas `triggers` e `trigger_fires`, service, política, fila de disparos enfileirados (inicia quando a run ativa termina), rotas, evento `trigger.fired`.
**Não inclui:** cron (#{TRG-02}), eventos e webhook (#{TRG-03}), tela (#{TRG-04}).

## Especificação técnica
### Arquivos
Criar:
- `src/shared/trigger_types.ts`
- `src/server/db/migrations/0800_triggers.sql`
- `src/server/db/schema/triggers.ts`
- `src/server/triggers/trigger_repository.ts`
- `src/server/triggers/trigger_service.ts`
- `src/server/triggers/concurrency_policy.ts`
- `src/server/triggers/trigger_service.test.ts`
- `src/server/triggers/concurrency_policy.test.ts`
- `src/server/triggers/triggers_routes.test.ts`
Alterar:
- `src/server/triggers/triggers_routes.ts` (substituir o stub de #{F-03})

### Contratos
```ts
export const TRIGGER_KINDS = ["manual", "schedule", "event", "webhook", "board_column"] as const;
export type TriggerConfig =
    | { kind: "manual" }
    | { kind: "schedule"; cron: string; timezone: string }
    | { kind: "event"; event: "usage.limit_reset" | "run.finished" | "work_item.created"; filter?: { flowId?: string; status?: RunStatusName } }
    | { kind: "webhook"; tokenHash: string }
    | { kind: "board_column"; columnId: string };
export interface Trigger { id: string; projectId: string; flowId: string; name: string; enabled: boolean;
    policy: "skip" | "queue" | "parallel"; itemSelection: "source" | "event_items"; config: TriggerConfig; createdAt: string; lastFiredAt?: string }
export interface TriggerFire { id: string; triggerId: string; at: string; outcome: "started" | "skipped" | "queued" | "error"; runId?: string; message?: string }
export function decidePolicy(policy: Trigger["policy"], activeRunIds: string[]): "start" | "skip" | "enqueue";
export interface TriggerService {
    create(input: Omit<Trigger, "id" | "createdAt" | "lastFiredAt">): Promise<Trigger>;
    update(id: string, patch: Partial<Pick<Trigger, "name" | "enabled" | "policy" | "config" | "itemSelection">>): Promise<Trigger>;
    remove(id: string): Promise<void>;
    list(projectId: string, opts?: { kind?: Trigger["config"]["kind"] }): Promise<Trigger[]>;
    fire(id: string, input: { itemIds?: string[]; reason: string }): Promise<TriggerFire>;
    history(id: string, limit: number): Promise<TriggerFire[]>;
    setAllPaused(paused: boolean): Promise<void>; isAllPaused(): Promise<boolean>; // usado por #{TRG-04}
}
```
- `fire`: gatilho desabilitado ou pausa global → `skipped` (exceto `manual`, que sempre roda). Política sobre as runs
  ativas do mesmo fluxo; `enqueue` guarda o disparo e o service assina `run.finished` (EventBus) para iniciar o próximo.
- Run iniciada com `triggerId` (campo já existe no `RunRecord`, #{ENG-09}).
- Rotas: `GET/POST /api/projects/:projectId/triggers`, `PATCH/DELETE /api/triggers/:id`, `POST /api/triggers/:id/fire`,
  `GET /api/triggers/:id/history`, `GET/PUT /api/triggers/paused`.
- Todo projeto ganha automaticamente um gatilho manual por fluxo ao publicar a primeira versão? **Não** — o executor já
  aceita runs sem gatilho (`POST /runs`); gatilhos são opcionais.

### Passo a passo
1. `decidePolicy` puro com testes.
2. Migração, schema, repositório, service (com fila de enfileirados persistida em `trigger_fires` `queued`).
3. Rotas.

## Critérios de aceite
- [ ] `fire` com política `skip` e run ativa do mesmo fluxo registra `skipped` e não inicia.
- [ ] Com `queue`, o disparo inicia quando a run ativa termina.
- [ ] Com `parallel`, inicia outra run.
- [ ] Pausa global faz gatilhos não manuais registrarem `skipped`.
- [ ] Cada disparo publica `trigger.fired` e aparece no histórico.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `concurrency_policy.test.ts`, `trigger_service.test.ts` (executor fake + EventBus), `triggers_routes.test.ts`.
