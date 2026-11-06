---
key: RT-04
title: "Parser de mensagens de limite de uso do Claude Code"
type: issue
milestone: "Fase 6 — Runtime de agentes"
labels: [tipo:feature, area:harness]
depends_on: [ENG-01]
---

## Contexto

Atende RF-RUN-06. A retomada automática (#{ENG-08}) depende de saber **quando** o limite reseta. O pipeline atual já
resolve isso em `.sandcastle/usage_guard.mts` (função `parseLimitResetTime`, que entende as mensagens do Claude Code e
converte horário com fuso para UTC). Esta issue porta essa lógica para uma função pura e testada.

## Objetivo

`parseUsageLimit(message, now)` reconhece mensagens de limite e devolve `{ isLimit: true, resetAt? }` com o horário em
UTC, cobrindo os formatos conhecidos.

## Escopo

**Inclui:** detecção, parsing de horário (com e sem data, com e sem fuso, am/pm, epoch), conversão de fuso, testes.
**Não inclui:** onde é chamado (#{RT-02}).

## Especificação técnica

### Arquivos

Criar:

- `src/integrations/agent_runtime/usage_limit_parser.ts`
- `src/integrations/agent_runtime/usage_limit_parser.test.ts`
- `src/test/fixtures/usage_limit_messages.ts`

### Contratos

```ts
export type UsageLimitParse = { isLimit: false } | { isLimit: true; resetAt?: Date };
export function parseUsageLimit(
    message: string,
    now: Date,
    defaultTimeZone?: string /* fuso do host */,
): UsageLimitParse;
```

Detecção (regex de `usage_guard.mts`): `/usage limit|session limit|weekly limit|hour limit|limit reached|rate.?limit|429|overloaded|529/i`.
Formatos de reset:

- `You've hit your session limit · resets 3:40pm (America/Sao_Paulo)` → hoje (ou amanhã, se já passou) 15:40 em São Paulo.
- `5-hour limit reached ∙ resets 3pm` → 15:00 no fuso padrão.
- `Weekly limit reached · resets Oct 24, 9am (America/Sao_Paulo)` → 24/10 09:00 (ano corrente; se já passou, ano seguinte).
- `Claude AI usage limit reached|1761072000` → epoch em segundos.
- `429`/`overloaded`/`529` sem horário → `{ isLimit: true }` sem `resetAt`.
  Conversão de fuso com `Intl.DateTimeFormat` (sem bibliotecas), como em `zonedTimeToUtc` do arquivo original.

### Passo a passo

1. Leia `.sandcastle/usage_guard.mts` (funções `parseLimitResetTime` e `zonedTimeToUtc`) e porte para TypeScript estrito, sem I/O.
2. Fixtures com as mensagens acima e variações (espaços, `·` vs `∙`, maiúsculas).
3. Testes com `now` fixo em datas que forçam "amanhã" e "ano seguinte".

## Critérios de aceite

- [ ] Os cinco formatos documentados são reconhecidos com o `resetAt` esperado.
- [ ] Horário já passado hoje vai para amanhã.
- [ ] Data já passada no ano vai para o ano seguinte.
- [ ] Mensagem comum de erro ("Error: ENOENT") devolve `isLimit: false`.
- [ ] Fuso inválido cai para o fuso padrão sem lançar.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `usage_limit_parser.test.ts`: tabela de mensagens × `now` × resultado esperado.
