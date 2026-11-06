---
key: TRG-02
title: "Gatilho cron com fuso e próximo disparo"
type: issue
milestone: "Fase 9 — Gatilhos e schedules"
labels: [tipo:feature, area:gatilhos]
depends_on: [TRG-01]
---

## Contexto

Atende RF-TRG-01 e RF-TRG-03. "Rodar a fábrica toda noite às 22h" e "a cada hora pegar issues novas" são o uso AFK
típico. O cálculo do próximo disparo é puro (testado com relógio fake); o runner usa `croner` e o `Clock`, iniciado pelo
módulo de rotas de gatilhos (convenção de hooks de #{F-03}).

## Objetivo

Gatilhos `schedule` disparam no horário do cron no fuso configurado, mostram o próximo disparo e sobrevivem a reinícios
(sem disparar em dobro nem recuperar disparos perdidos enquanto o servidor estava desligado).

## Escopo

**Inclui:** validação de expressão cron, `nextFireAt` puro, runner com reagendamento após cada disparo e após edição, próximo disparo na API.
**Não inclui:** catch-up de disparos perdidos (decisão: não recuperar; registrar no log "1 disparo perdido enquanto desligado").

## Especificação técnica

### Arquivos

Criar:

- `src/engine/cron_schedule.ts`
- `src/engine/cron_schedule.test.ts`
- `src/server/triggers/cron_runner.ts`
- `src/server/triggers/cron_runner.test.ts`
  Alterar:
- `src/server/triggers/triggers_routes.ts` (iniciar/parar o runner por hooks; incluir `nextFireAt` na listagem; validar cron no create/update)
- `src/server/triggers/trigger_service.ts` (notificar o runner em create/update/remove)

### Contratos

```ts
export function validateCron(expression: string): { ok: true } | { ok: false; message: string }; // 5 campos
export function nextFireAt(expression: string, timezone: string, after: Date): Date;
export function describeCron(expression: string): string; // "todo dia às 22:00", "a cada hora no minuto 0", fallback: a expressão
export function createCronRunner(deps: {
    clock: Clock;
    listScheduleTriggers(): Promise<Trigger[]>;
    fire(id: string): Promise<unknown>;
    log(msg: string): void;
}): { start(): Promise<void>; reschedule(triggerId: string): Promise<void>; stop(): void };
```

- O runner agenda só o próximo disparo de cada gatilho com `clock.setTimeout`; ao disparar, chama `fire(id, { reason: "cron" })` e agenda o seguinte.
- Atrasos de timer (PC suspenso): se o timer acorda mais de 2 min depois do horário, registra "disparo atrasado" e dispara uma vez.
- `describeCron` cobre os padrões comuns (diário, de hora em hora, dias úteis); o resto mostra a expressão.

### Passo a passo

1. Funções puras com `croner` (ou parser próprio para `nextFireAt` se `croner` não aceitar relógio injetado — use `new Cron(expr, { timezone }).nextRun(after)`).
2. Runner com `Clock` e testes com `FakeClock`.
3. Wiring nos hooks e no service.

## Critérios de aceite

- [ ] `0 22 * * *` em `America/Sao_Paulo` dispara às 22:00 de São Paulo (01:00 UTC).
- [ ] Cron inválido → 422 com mensagem.
- [ ] Editar a expressão reagenda imediatamente; desabilitar cancela o timer.
- [ ] Reiniciar o servidor não dispara em dobro.
- [ ] A listagem mostra `nextFireAt` e a descrição legível.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `cron_schedule.test.ts`: próximos disparos com fuso, horário de verão de outros fusos, validação, descrição.
- `cron_runner.test.ts`: disparo, reagendamento, desabilitar, atraso.
