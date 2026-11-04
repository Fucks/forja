---
key: QA-04
title: "Retenção e limpeza de logs e workspaces"
type: issue
milestone: "Fase 11 — Qualidade e lançamento"
labels: [tipo:qualidade, area:logs]
depends_on: [GIT-02, RT-06, OBS-03]
---

## Contexto
Atende RNF-RET-01. Uma fábrica rodando todo dia acumula gigabytes de logs NDJSON e worktrees esquecidos. As configurações
globais já têm `logRetentionDays` e `logMaxTotalMb` (#{CFG-05}); falta o job que aplica isso e limpa worktrees de runs
terminadas.

## Objetivo
Um job diário (e sob demanda) remove logs de runs terminadas há mais de N dias e, se o total passar do teto, os mais antigos
primeiro; remove worktrees órfãos em `.sandcastle/worktrees/` dos projetos; e informa o espaço liberado.

## Escopo
**Inclui:** `planCleanup` puro, executor da limpeza, job pelos hooks do módulo de runs, rota sob demanda, item no diagnóstico com uso de disco.
**Não inclui:** apagar runs do banco (metadados ficam; só os logs saem, e a UI mostra "logs removidos pela retenção").

## Especificação técnica
### Arquivos
Criar:
- `src/server/maintenance/plan_cleanup.ts`
- `src/server/maintenance/plan_cleanup.test.ts`
- `src/server/maintenance/cleanup_service.ts`
- `src/server/maintenance/cleanup_service.test.ts`
Alterar:
- `src/server/runs/logs_routes.ts` (iniciar o job por hooks; `POST /api/maintenance/cleanup`; leitura de log removido devolve 410 `logs_expired`)
- `src/server/diagnostics/diagnostic_checks.ts` (item "espaço em disco da Forja")
- `src/web/logs/use_node_run_logs.ts` (410 → mensagem "Logs removidos pela política de retenção")

### Contratos
```ts
export interface LogDirInfo { runId: string; finishedAt?: Date; bytes: number; active: boolean }
export function planCleanup(dirs: LogDirInfo[], policy: { retentionDays: number; maxTotalBytes: number }, now: Date): { deleteRunIds: string[]; freedBytes: number };
// nunca remove runs ativas; primeiro as vencidas, depois as mais antigas até caber no teto
export async function runCleanup(deps: { logs: LogStore; runs: RunRepository; settings: SettingsService; projects: ProjectService; git: GitProvider; clock: Clock }): Promise<{ deletedRuns: number; freedBytes: number; prunedWorktrees: number }>;
```
Worktrees: para cada projeto, `git worktree prune` e remoção de diretórios em `.sandcastle/worktrees/` sem worktree registrado
(mesma ideia de `removeOrphanedWorktreeDirs` do `.sandcastle/main.mts`); nunca toca em worktrees de runs ativas.

### Passo a passo
1. `planCleanup` puro.
2. Serviço, job diário às 03:00 locais (via `nextFireAt` de #{TRG-02}), rota.
3. 410 nos logs e mensagem na UI; item de disco no diagnóstico.

## Critérios de aceite
- [ ] Logs de runs terminadas há mais de 30 dias são removidos; runs ativas nunca.
- [ ] Acima do teto, remove as mais antigas até caber.
- [ ] Abrir logs removidos mostra a mensagem de retenção.
- [ ] Worktrees órfãos são removidos e os ativos preservados.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `plan_cleanup.test.ts`; `cleanup_service.test.ts` (diretório temporário + fakes).
