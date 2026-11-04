---
key: TRG-03
title: "Gatilhos por evento (incluindo limite resetado) e webhook local"
type: issue
milestone: "Fase 9 — Gatilhos e schedules"
labels: [tipo:feature, area:gatilhos]
depends_on: [TRG-02, ENG-08]
---

## Contexto
Atende RF-TRG-01 — o requisito do usuário "habilitar schedules para triggar nós, por exemplo quando atingir o limite de
tokens". A retomada da run pausada já é automática (#{ENG-08}); este gatilho serve para **iniciar** um fluxo quando o
limite reseta (ex.: "quando a quota voltar, rode a fábrica de novo para pegar o que ficou"), quando uma run termina
(encadear fluxos) ou quando um item é criado. O webhook local permite acionar a Forja de scripts e de outras ferramentas.

## Objetivo
Gatilhos `event` disparam ao ocorrer o evento correspondente no EventBus (com filtros), e gatilhos `webhook` disparam por
`POST /api/hooks/:triggerId` com token, só a partir de `127.0.0.1`.

## Escopo
**Inclui:** listener de eventos com filtros, anti-loop (um fluxo não se dispara pelo próprio `run.finished` em cadeia infinita), webhook com token gerado uma vez, itens do evento.
**Não inclui:** webhooks externos expostos à internet.

## Especificação técnica
### Arquivos
Criar:
- `src/server/triggers/event_trigger_listener.ts`
- `src/server/triggers/event_trigger_listener.test.ts`
- `src/server/triggers/webhook_tokens.ts`
- `src/server/triggers/webhook_routes.test.ts`
Alterar:
- `src/server/triggers/webhook_routes.ts` (substituir o stub de #{F-03})
- `src/server/triggers/triggers_routes.ts` (iniciar o listener por hooks; criar webhook devolve o token **uma vez**; `POST /api/triggers/:id/rotate-token`)
- `src/server/triggers/trigger_service.ts`

### Contratos
```ts
export function matchesEventTrigger(trigger: Trigger & { config: { kind: "event" } }, envelope: EventEnvelope): boolean;
// usage.limit_reset: mesmo projeto; run.finished: mesmo projeto + filtro de flowId/status; work_item.created: mesmo projeto
export function eventItems(trigger: Trigger, envelope: EventEnvelope): string[] | undefined; // work_item.created → [workItemId] quando itemSelection = "event_items"
export function createEventTriggerListener(deps: { events: EventBus; triggers: TriggerService; maxChainDepth: number /* 3 */ }): { start(): void; stop(): void };

export function generateWebhookToken(): { token: string; hash: string }; // 32 bytes base64url; hash sha256
export function verifyWebhookToken(token: string, hash: string): boolean;  // timingSafeEqual
```
- Anti-loop: a run iniciada por gatilho de evento carrega `triggerChainDepth` (guarde em `trigger_fires.message` como JSON
  `{ depth }` e propague); acima de `maxChainDepth` → `skipped` com mensagem "cadeia de gatilhos muito longa".
- Webhook: `POST /api/hooks/:triggerId` com header `X-Forja-Token`; corpo opcional `{ itemIds?: string[] }`; IP remoto
  diferente de `127.0.0.1`/`::1` → 403; token errado → 401; ok → 202 com o `TriggerFire`.

### Passo a passo
1. Funções puras de casamento e itens; listener assinando o EventBus.
2. Tokens e rota de webhook.
3. Wiring nos hooks.

## Critérios de aceite
- [ ] Um gatilho `usage.limit_reset` dispara o fluxo quando o evento é publicado para o mesmo projeto.
- [ ] `run.finished` com filtro `status: SUCCEEDED` não dispara para runs com falha.
- [ ] `work_item.created` com `event_items` inicia a run só com o item criado.
- [ ] Fluxo A → B → A → … para na profundidade 3.
- [ ] Webhook sem token/token errado → 401; de fora do localhost → 403; correto → 202.
- [ ] O token só aparece na resposta de criação/rotação.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `event_trigger_listener.test.ts`: casamento, filtros, itens, anti-loop.
- `webhook_routes.test.ts`: autenticação, IP, corpo.
