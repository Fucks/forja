---
key: OBS-05
title: "Painel de uso de tokens e custo"
type: issue
milestone: "Fase 7 — Execução ao vivo e logs"
labels: [tipo:feature, area:uso-custo]
depends_on: [RT-05, OBS-03]
---

## Contexto

Atende RF-OBS-05 e RNF-CUS-01. "Onde o loop está queimando tokens?" é a pergunta que nenhum concorrente responde bem
(benchmark). Com os registros de #{RT-05}, esta issue cria a página de uso e mostra o custo no drawer do NodeRun e por
iteração de loop.

## Objetivo

Em `/projects/:projectId/usage` o usuário vê o gasto do período (tokens e US$) por dia, por fluxo, por nó, por modelo e por
item, e o drawer do NodeRun (#{OBS-02}) mostra tokens e custo daquela execução.

## Escopo

**Inclui:** página com seletor de período e agrupamento, gráfico de barras por dia, tabelas, orçamento diário vs. gasto,
custo no drawer.
**Não inclui:** alertas de custo por e-mail.

## Especificação técnica

### Arquivos

Criar:

- `src/web/app/usage/use_usage.ts`
- `src/web/app/usage/usage_chart.tsx`
- `src/web/app/usage/usage_table.tsx`
- `src/web/app/usage/usage_page.test.tsx`
  Alterar:
- `src/web/app/usage/usage_page.tsx` (substituir o placeholder)
- `src/web/canvas/live/node_run_detail.tsx` (KeyValue: tokens de entrada, saída, cache, custo, modelo)

### Contratos

```ts
export function useUsage(
    projectId: string,
    query: { from: string; to: string; groupBy: UsageQuery["groupBy"]; flowId?: string },
): UseQueryResult<UsageRow[]>;
```

Períodos: hoje, 7 dias (padrão), 30 dias, personalizado. Agrupamentos: dia, fluxo, nó, modelo, item, run.

### Passo a passo

1. Hook.
2. Gráfico de barras empilhadas (entrada/saída) por dia com custo no tooltip; cores de série a partir dos tokens
   (`--color-steel` para entrada, `--color-accent` para saída), eixos em `--color-text-muted`.
3. Tabela com totais; clicar numa linha de nó filtra por aquele nó.
4. Cartão "Hoje": gasto vs. orçamento diário (#{CFG-05}) com barra de progresso; acima de 80% em `--status-waiting-approval`.
5. Custo no detalhe do NodeRun (via `GET /api/runs/:runId/usage`).

### Notas de design

Números grandes em IBM Plex Sans Condensed; valores com `formatTokens`/`formatUsd`. Marque `priceEstimated` com "≈".

## Critérios de aceite

- [ ] Mudar o agrupamento para "nó" mostra o custo de cada nó no período.
- [ ] O gráfico de 7 dias mostra uma barra por dia, inclusive dias sem gasto.
- [ ] O cartão "Hoje" compara com o orçamento diário quando configurado.
- [ ] O detalhe do NodeRun mostra tokens e custo.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `usage_page.test.tsx` (API mockada): agrupamentos, dias vazios, cartão de orçamento.
