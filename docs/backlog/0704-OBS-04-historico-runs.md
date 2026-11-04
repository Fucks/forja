---
key: OBS-04
title: "Histórico de runs"
type: issue
milestone: "Fase 7 — Execução ao vivo e logs"
labels: [tipo:feature, area:execucao-ao-vivo]
depends_on: [OBS-01]
---

## Contexto
Atende RF-OBS-04. O usuário acorda e quer saber o que rodou à noite: quais runs, quanto tempo, quantos itens deram certo,
quanto custou. Clicar abre a run no canvas (#{OBS-01}), que mostra o estado final.

## Objetivo
Em `/projects/:projectId/runs` o usuário vê as runs (ativas no topo), filtra por fluxo e estado, pagina, e abre uma run;
na visão geral do projeto aparece um resumo das últimas runs.

## Escopo
**Inclui:** `RunsPage`, tabela com atualização ao vivo, filtros, paginação, botão "Nova run" (escolher fluxo e itens
digitando ids — a escolha visual de itens vem com o board, #{BRD-05}), resumo na visão geral do projeto.
**Não inclui:** custos detalhados (#{OBS-05}).

## Especificação técnica
### Arquivos
Criar:
- `src/web/app/runs/use_runs.ts`
- `src/web/app/runs/runs_table.tsx`
- `src/web/app/runs/new_run_dialog.tsx`
- `src/web/app/runs/recent_runs_card.tsx`
- `src/web/app/runs/runs_page.test.tsx`
Alterar:
- `src/web/app/runs/runs_page.tsx` (substituir o placeholder)
- `src/web/app/projects/project_page.tsx` (card "Últimas runs")
- `src/server/runs/run_service.ts` e `src/server/runs/runs_routes.ts` (lista inclui `flowName`, `itemCount`, `failedItemCount`, `durationMs`, `costUsd` quando #{RT-05} existir — use `usage_service.forRun` se disponível, senão omita)

### Contratos
```ts
export interface RunListItem { id: string; flowId: string; flowName: string; flowVersion: number; status: RunStatusName; pauseReason?: string;
    itemCount: number; failedItemCount: number; createdAt: string; startedAt?: string; finishedAt?: string; durationMs?: number; costUsd?: number; triggerName?: string }
export function useRuns(projectId: string, filters: { flowId?: string; status?: RunStatusName[] }): UseInfiniteQueryResult<RunListItem[]>;
```
Atualização ao vivo: `useEventStream({ projectId })` invalida a lista em `run.*`.

### Passo a passo
1. Enriquecer a lista no servidor.
2. Hook com `useInfiniteQuery` (cursor `before`).
3. Tabela: estado, fluxo e versão, itens (ok/falhos), início, duração (`formatDuration`), custo (`formatUsd`), gatilho.
4. "Nova run": Select de fluxo (só publicados), campo de itens opcional, botão "Executar" → navega para a run.
5. Card na visão geral com as 5 últimas.

### Notas de design
Tabela densa; runs ativas com `StatusBadge` animado. Linha inteira clicável.

## Critérios de aceite
- [ ] A lista mostra runs com estado, duração e itens; runs ativas atualizam sem recarregar.
- [ ] Filtrar por estado "Falha" mostra só runs com falha.
- [ ] "Carregar mais" pagina pelo cursor.
- [ ] "Nova run" inicia e abre a run.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `runs_page.test.tsx` (API mockada): lista, filtro, nova run, atualização por evento.
