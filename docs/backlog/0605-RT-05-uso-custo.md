---
key: RT-05
title: "Registro de uso de tokens e custo estimado"
type: issue
milestone: "Fase 6 — Runtime de agentes"
labels: [tipo:feature, area:uso-custo]
depends_on: [RT-03, CFG-05]
---

## Contexto
Atende RF-OBS-05 e RNF-CUS-01: todo token gasto precisa ser atribuível a projeto, fluxo, nó, item e iteração. O
o resultado do Claude Code traz tokens (input, output, cache read, cache creation) e um `total_cost_usd` estimado pelo próprio CLI; a Forja grava os tokens e calcula o custo com a tabela de
preços por modelo das configurações globais (#{CFG-05}), editável pelo usuário. O orçamento (#{ENG-07}) precisa do
gasto do dia ao criar o scheduler.

## Objetivo
Cada NodeRun de agente concluído (ou interrompido com uso conhecido) grava um `UsageRecord` com tokens e custo, publica
`usage.recorded`, e existe a API de agregações por período, fluxo, nó, modelo e dia.

## Escopo
**Inclui:** tabela, cálculo de custo, preços padrão, gravação no executor, `todaySpent(projectId)` para o orçamento, rotas de agregação.
**Não inclui:** tela (#{OBS-05}).

## Especificação técnica
### Arquivos
Criar:
- `src/shared/usage_types.ts`
- `src/server/db/migrations/0650_usage.sql`
- `src/server/db/schema/usage.ts`
- `src/server/usage/model_prices.ts`
- `src/server/usage/usage_service.ts`
- `src/server/usage/usage_service.test.ts`
- `src/server/usage/usage_routes.test.ts`
Alterar:
- `src/server/usage/usage_routes.ts` (substituir o stub de #{F-03})
- `src/server/runtime/executor.ts` (gravar uso após cada agente; passar `todaySpent` ao orçamento do scheduler)

### Contratos
```ts
export interface ModelPrice { inputPerMTok: number; outputPerMTok: number; cacheReadPerMTok: number; cacheWritePerMTok: number }
export const DEFAULT_MODEL_PRICES: Record<string, ModelPrice>; // por família: opus, sonnet, haiku, fable — valores em USD, revisáveis
export function priceFor(model: string, overrides: Record<string, ModelPrice>): ModelPrice; // casa por prefixo/família; desconhecido → preço do opus e flag estimated
export function estimateCostUsd(usage: TokenUsage, price: ModelPrice): number;

export interface UsageRecord { id: string; projectId: string; runId: string; flowId: string; nodeId: string; nodeRunId: string;
    workItemId?: string; iteration: number; model: string; usage: TokenUsage; costUsd: number; priceEstimated: boolean; at: string }
export interface UsageQuery { projectId: string; from: Date; to: Date; groupBy: "day" | "flow" | "node" | "model" | "item" | "run"; flowId?: string }
export interface UsageService {
    record(input: Omit<UsageRecord, "id" | "costUsd" | "priceEstimated" | "at">): Promise<UsageRecord>;
    aggregate(query: UsageQuery): Promise<{ key: string; label: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; costUsd: number; nodeRuns: number }[]>;
    todaySpent(projectId: string, timezone: string): Promise<{ costUsd: number; tokens: number }>;
    forRun(runId: string): Promise<UsageRecord[]>;
}
```
Rotas: `GET /api/projects/:projectId/usage?from=&to=&groupBy=&flowId=`, `GET /api/runs/:runId/usage`.
Ao alterar preços nas configurações globais, registros antigos **não** são recalculados (o custo é o da época).
Comente em `model_prices.ts` que os valores padrão precisam ser conferidos na página de preços da Anthropic (tarefa humana #{HUM-04}).

### Passo a passo
1. Preços e cálculo puros.
2. Migração, schema, service.
3. Executor: após `runAgent`, `record(...)`, publicar `usage.recorded` e enviar `usage_recorded` ao scheduler.
4. Rotas de agregação (SQL com `GROUP BY`).

## Critérios de aceite
- [ ] Um agente com 1 M de tokens de entrada no modelo opus grava o custo calculado pelo preço configurado.
- [ ] Modelo desconhecido grava `priceEstimated: true`.
- [ ] Agregação por dia respeita o fuso do projeto.
- [ ] `todaySpent` alimenta o orçamento diário do scheduler.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `usage_service.test.ts`: custo, família de modelo, agregações por cada `groupBy`, fuso.
- `usage_routes.test.ts`: parâmetros e validação.
