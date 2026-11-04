---
key: ENG-09
title: "Persistência de runs, NodeRuns, artefatos e snapshot do scheduler"
type: issue
milestone: "Fase 5 — Motor de execução"
labels: [tipo:feature, area:motor]
depends_on: [F-05, ENG-02]
---

## Contexto
Atende RNF-CON-01 (execução durável). O executor (#{ENG-10}) grava cada transição; o histórico (#{OBS-04}), o board
(#{BRD-05}) e a recuperação após reinício (#{ENG-11}) leem daqui. O snapshot do scheduler é gravado junto para
retomar exatamente de onde parou.

## Objetivo
Existe um `RunRepository` (interface + SQLite + fake em memória) que grava e lê runs, NodeRuns, artefatos e o snapshot do
scheduler de forma transacional.

## Escopo
**Inclui:** migração `0600_runs.sql`, schema Drizzle, repositório, fake, consultas para histórico e board.
**Não inclui:** logs (#{RT-03}), uso (#{RT-05}), API (#{ENG-12}).

## Especificação técnica
### Arquivos
Criar:
- `src/server/db/migrations/0600_runs.sql`
- `src/server/db/schema/runs.ts`
- `src/server/runs/run_repository.ts`
- `src/server/runs/sqlite_run_repository.ts`
- `src/test/fakes/in_memory_run_repository.ts`
- `src/server/runs/sqlite_run_repository.test.ts`

### Contratos
```ts
export interface RunRecord extends RunState { triggerId?: string; itemIds: string[]; failedItemIds: string[] }
export interface ArtifactRecord { id: string; nodeRunId: string; runId: string; name: string; kind: "text" | "json" | "branch" | "pr_url"; value: unknown; createdAt: string }
export interface RunRepository {
    createRun(run: RunRecord): Promise<void>;
    saveTransition(change: { run?: RunState; nodeRuns?: NodeRunState[]; artifacts?: ArtifactRecord[]; snapshot?: unknown }): Promise<void>; // uma transação
    getRun(id: string): Promise<RunRecord | undefined>;
    listRuns(projectId: string, opts: { limit: number; before?: string; flowId?: string; status?: RunStatusName[] }): Promise<RunRecord[]>;
    listNodeRuns(runId: string): Promise<NodeRunState[]>;
    getNodeRun(id: string): Promise<NodeRunState | undefined>;
    listArtifacts(nodeRunId: string): Promise<ArtifactRecord[]>;
    getSnapshot(runId: string): Promise<unknown | undefined>;
    listActiveRuns(): Promise<RunRecord[]>;                       // QUEUED, RUNNING, PAUSED
    latestNodeRunsByItem(projectId: string, itemIds: string[]): Promise<Record<string, NodeRunState[]>>; // para o board
}
```
Tabelas: `runs(id, project_id, flow_id, flow_version, status, pause_reason, resume_at, trigger_id, item_ids_json,
failed_item_ids_json, error, created_at, started_at, finished_at)`, `node_runs(id, run_id FK, node_id, work_item_id,
iteration, attempt, group_path_json, status, error_json, inputs_json, outputs_json, queued_at, started_at, finished_at)`,
`artifacts(...)`, `run_snapshots(run_id PK, json, updated_at)`. Índices: `runs(project_id, created_at desc)`,
`node_runs(run_id)`, `node_runs(work_item_id, started_at)`.

### Passo a passo
1. Migração, schema e repositório SQLite com `saveTransition` em transação (upsert de NodeRuns).
2. Fake em memória com o mesmo comportamento (usado por testes do executor).
3. Testes contra `createTestDb()`.

## Critérios de aceite
- [ ] `saveTransition` grava run, NodeRuns, artefatos e snapshot atomicamente (falha no meio não deixa nada parcial).
- [ ] `listRuns` pagina por `created_at` desc e filtra por fluxo e status.
- [ ] `listActiveRuns` traz só QUEUED, RUNNING e PAUSED.
- [ ] Datas voltam como `Date` nos tipos de domínio.
- [ ] O fake passa nos mesmos testes de contrato que o SQLite.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `sqlite_run_repository.test.ts`: suíte de contrato aplicada às duas implementações (`describe.each`).
