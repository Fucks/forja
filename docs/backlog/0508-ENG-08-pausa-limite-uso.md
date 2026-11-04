---
key: ENG-08
title: "Pausa e retomada automática por limite de uso"
type: issue
milestone: "Fase 5 — Motor de execução"
labels: [tipo:feature, area:motor]
depends_on: [ENG-07]
---

## Contexto
Atende RF-RUN-06 — um dos diferenciais da pesquisa: execuções AFK morrem no limite de uso do Claude. O pipeline atual
do usuário resolve isso com `.sandcastle/usage_guard.mts` (espera o horário de reset e tenta de novo). Na Forja, o
runtime lança `UsageLimitError { resetAt? }` (#{ENG-01}; parsing em #{RT-04}) e o scheduler pausa a run inteira e
agenda a retomada — o limite é da conta, então continuar outros agentes só gastaria tentativas.

## Objetivo
Quando um NodeRun falha por limite de uso, o scheduler o põe em `WAITING_LIMIT` (sem contar tentativa), pausa a run com
`resumeAt`, cancela/aguarda os demais conforme a política e retoma sozinho no horário, emitindo os comandos que geram
`usage.limit_reached` e `usage.limit_reset`.

## Escopo
**Inclui:** `usage_pause.ts` puro (cálculo do `resumeAt`), integração no scheduler, comando de notificação de limite, retomada.
**Não inclui:** parser das mensagens (#{RT-04}), gatilhos por evento (#{TRG-03}).

## Especificação técnica
### Arquivos
Criar:
- `src/engine/usage_pause.ts`
- `src/engine/usage_pause.test.ts`
Alterar:
- `src/engine/scheduler_types.ts`
- `src/engine/scheduler.ts`
- `src/engine/scheduler.test.ts`

### Contratos
```ts
export function computeResumeAt(now: Date, resetAt: Date | undefined, marginMinutes: number, fallbackMinutes = 30): Date;
// resetAt no passado ou ausente → now + fallback; senão resetAt + margem

// SchedulerOptions ganha `usageLimitMarginMinutes: number`
// novos SchedulerCommand:
| { type: "usage_limit_reached"; resetAt?: Date; resumeAt: Date }
| { type: "usage_limit_reset" }
```

### Semântica
- `node_run_failed` com `kind: "usage_limit"` → NodeRun `WAITING_LIMIT` (não cria nova tentativa; `attempt` não muda);
  run `PAUSED` com `pauseReason: "usage_limit"` e `resumeAt`; comando `usage_limit_reached`; `schedule_wakeup(resumeAt)`.
- Outros NodeRuns RUNNING continuam até terminar (eles podem concluir antes de bater no limite); se também baterem no
  limite, viram `WAITING_LIMIT` sem novo comando de pausa (o `resumeAt` mais tarde prevalece).
- Nada novo começa enquanto a run está pausada.
- No `tick(now >= resumeAt)`: comando `usage_limit_reset`; NodeRuns `WAITING_LIMIT` → `QUEUED` (mesmo `attempt`; o
  agente retoma no mesmo branch, e os commits feitos antes do limite continuam lá); run → `RUNNING`.
- Pausa do usuário durante a pausa por limite: ao chegar `resumeAt`, a run continua `PAUSED` com `pauseReason: "user"`.

### Passo a passo
1. `computeResumeAt` com testes (inclui `resetAt` no passado).
2. Integração no scheduler conforme a semântica.

## Critérios de aceite
- [ ] Limite com `resetAt` 15:00 e margem 5 min → run pausada com `resumeAt` 15:05 e comando `usage_limit_reached`.
- [ ] Sem `resetAt`, retoma em 30 min.
- [ ] Nenhum NodeRun começa durante a pausa; os que estavam RUNNING terminam.
- [ ] Às 15:05 os NodeRuns em `WAITING_LIMIT` voltam para a fila com o mesmo `attempt` e a run volta a RUNNING.
- [ ] Bater no limite não consome retentativas.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `usage_pause.test.ts`: casos de `computeResumeAt`.
- `scheduler.test.ts`: map de 3 Devs, o 2º bate no limite; verificar pausa, término dos outros, retomada e tentativas.
