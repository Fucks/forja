---
key: RT-03
title: "Log store NDJSON por NodeRun com redação de segredos"
type: issue
milestone: "Fase 6 — Runtime Sandcastle"
labels: [tipo:feature, area:logs]
depends_on: [RT-02, CFG-02, ENG-12]
---

## Contexto
Atende RF-OBS-03 e RNF-SEG-02. Cada NodeRun gera muitos eventos; guardá-los no SQLite incharia o banco (PRD:
NDJSON em `~/.forja/logs/<runId>/<nodeRunId>.ndjson`). O canvas ao vivo precisa ler o histórico e receber o resto por
SSE (`log.appended`, #{F-06}). Segredos registrados no redator (#{CFG-01}, #{CFG-02}) são mascarados **antes** de gravar.

## Objetivo
Existe `LogStore` que grava eventos de agente numerados por NodeRun, com redação, e a API de leitura paginada e de
download bruto; o executor passa a usá-lo e publicar `log.appended`.

## Escopo
**Inclui:** `LogStore` (append, leitura por faixa, contagem, download), índice no SQLite (contagem e tamanho por NodeRun),
integração no executor, rotas.
**Não inclui:** UI (#{OBS-03}), retenção (#{QA-04}).

## Especificação técnica
### Arquivos
Criar:
- `src/shared/log_types.ts`
- `src/server/runtime/log_store.ts`
- `src/server/db/migrations/0610_log_index.sql`
- `src/server/db/schema/log_index.ts`
- `src/server/runtime/log_store.test.ts`
- `src/server/runs/logs_routes.test.ts`
Alterar:
- `src/server/runs/logs_routes.ts` (substituir o stub de #{F-03})
- `src/server/runtime/executor.ts` (usar o `LogStore` em `onAgentEvent`)
- `src/server/app.ts` (`AppDeps` ganha `logs: LogStore`)
- `src/server/main.ts` (com `FORJA_AGENT_RUNTIME=sandcastle` — o padrão —, usar `createSandcastleAgentRuntime({ api: createSandcastleApi(), ... })` de #{RT-01}; `fake` continua com o runtime indisponível até #{OBS-06})

### Contratos
```ts
export interface StoredLogEvent { seq: number; at: string; kind: AgentEvent["kind"]; text?: string; name?: string; args?: string; line?: string; message?: string; iteration?: number }
export interface LogStore {
    append(ref: { runId: string; nodeRunId: string }, event: AgentEvent): Promise<StoredLogEvent>; // aplica o redator
    read(nodeRunId: string, opts: { fromSeq?: number; limit: number }): Promise<{ events: StoredLogEvent[]; nextSeq: number; total: number }>;
    rawStream(nodeRunId: string): NodeJS.ReadableStream;
    stats(nodeRunId: string): Promise<{ count: number; bytes: number }>;
    deleteRun(runId: string): Promise<void>;
}
export function createLogStore(deps: { logsDir: string; db: ForjaDb; redactor: SecretRedactor; clock: Clock; fs?: FsLike }): LogStore;
```
- Uma linha JSON por evento; `seq` começa em 1 por NodeRun; escrita serializada por NodeRun (fila) para não intercalar.
- Índice `log_index(node_run_id PK, run_id, count, bytes, updated_at)`.
- Executor: a cada `append`, publica `log.appended { fromSeq, toSeq }` agrupando eventos a cada 250 ms (evita inundar o SSE).
- Rotas: `GET /api/node-runs/:id/logs?fromSeq=&limit=` (limit ≤ 2 000), `GET /api/node-runs/:id/logs/raw` (download `text/plain`, `content-disposition`).

### Passo a passo
1. `LogStore` com fs injetável (testes em diretório temporário).
2. Redação: `redactor.redact` em todos os campos de texto antes de serializar.
3. Integração no executor com o agrupamento de 250 ms.
4. Rotas.

## Critérios de aceite
- [ ] Eventos de um NodeRun são lidos em ordem por faixa de `seq`.
- [ ] Um segredo registrado nunca aparece no arquivo (teste lê o arquivo).
- [ ] Appends concorrentes no mesmo NodeRun mantêm `seq` contínuo e linhas íntegras.
- [ ] `log.appended` é publicado no máximo a cada 250 ms por NodeRun com a faixa correta.
- [ ] O download bruto devolve o NDJSON completo.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `log_store.test.ts`: append/read, redação, concorrência, stats, deleteRun.
- `logs_routes.test.ts`: paginação e download.
