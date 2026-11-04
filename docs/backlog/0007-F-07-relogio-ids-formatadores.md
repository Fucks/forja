---
key: F-07
title: "Relógio, ids e formatadores compartilhados"
type: issue
milestone: "Fase 0 — Fundação"
labels: [tipo:infra, area:fundacao]
depends_on: [F-01]
---

## Contexto
O motor é puro e testado com relógio fake (PRD, "Padrões"); o resto precisa de ids estáveis e de formatação de
duração, tokens e custo idêntica na API e na SPA. Centralizar evita três versões de "formatar duração".

## Objetivo
Existem `Clock`, `systemClock`, `FakeClock`, `newId` com prefixo e formatadores testados.

## Escopo
**Inclui:** `clock.ts`, `fake_clock.ts`, `ids.ts`, `format.ts`.
**Não inclui:** agendamento (o scheduler usa o `FakeClock` em #{ENG-03}).

## Especificação técnica
### Arquivos
Criar:
- `src/lib/clock.ts`
- `src/test/fakes/fake_clock.ts`
- `src/lib/ids.ts`
- `src/lib/format.ts`
- `src/lib/format.test.ts`
- `src/lib/ids.test.ts`
- `src/test/fakes/fake_clock.test.ts`

### Contratos
```ts
export interface Clock { now(): Date; setTimeout(fn: () => void, ms: number): () => void }
export const systemClock: Clock;

export class FakeClock implements Clock {
    constructor(start?: Date); // padrão 2026-01-01T00:00:00Z
    now(): Date;
    setTimeout(fn: () => void, ms: number): () => void;
    advance(ms: number): void; // dispara timers vencidos em ordem de horário
    set(date: Date): void;
}

export type IdPrefix = "prj" | "flw" | "ver" | "run" | "nrn" | "itm" | "trg" | "cred" | "tlp" | "apv" | "art" | "usg";
export function newId(prefix: IdPrefix): string; // "run_01JBX…" (ULID, ordenável)

export function formatDuration(ms: number): string;      // 950 → "0,9 s"; 75_000 → "1 min 15 s"; 3_900_000 → "1 h 5 min"
export function formatTokens(count: number): string;     // 980 → "980"; 12_400 → "12,4 mil"; 3_200_000 → "3,2 mi"
export function formatUsd(amount: number): string;       // 0.004 → "US$ 0,004"; 1.5 → "US$ 1,50"
export function formatRelativeOffset(ms: number): string; // 42_000 → "+00:42"; 3_723_000 → "+1:02:03"
```

### Passo a passo
1. `systemClock` com `setTimeout` real e função de cancelamento.
2. `FakeClock` com fila de timers ordenada; timers agendados durante `advance` também disparam se vencerem.
3. `newId` com ULID (`ulid` como dependência ou implementação com `crypto.getRandomValues`).
4. Formatadores com locale `pt-BR`; valores negativos lançam `RangeError`.

## Critérios de aceite
- [ ] `FakeClock.advance` dispara timers vencidos em ordem e não dispara cancelados.
- [ ] `newId("run")` começa com `run_`; ids gerados em sequência são ordenáveis lexicamente.
- [ ] Formatadores retornam exatamente os exemplos acima.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `fake_clock.test.ts`, `ids.test.ts`, `format.test.ts` com os exemplos e as bordas (0, negativos).
