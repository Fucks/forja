---
key: OBS-03
title: "Logs em streaming no drawer do nó"
type: issue
milestone: "Fase 7 — Execução ao vivo e logs"
labels: [tipo:feature, area:logs]
depends_on: [OBS-02, DS-06, RT-03]
---

## Contexto

Atende RF-OBS-03 — "ter uma forma de ver os logs de cada nó agente". O `LogViewer` virtualizado existe (#{DS-06}), os
eventos estão gravados por NodeRun (#{RT-03}) e chegam ao vivo por `log.appended`. Falta ligar: carregar o histórico,
seguir o stream e renderizar cada tipo de evento do agente de forma legível.

## Objetivo

A aba "Logs" do NodeRun selecionado mostra os eventos do agente desde o início e acompanha em tempo real, com texto,
chamadas de ferramenta recolhíveis, linhas brutas, erros e eventos do sistema, e botão para baixar o NDJSON bruto.

## Escopo

**Inclui:** hook de logs (histórico paginado + incremental), conversão `StoredLogEvent` → `LogLine`, renderizadores,
filtro por tipo ("só texto", "ferramentas", "bruto"), download, abrir logs em tela cheia.
**Não inclui:** busca entre NodeRuns.

## Especificação técnica

### Arquivos

Criar:

- `src/web/logs/use_node_run_logs.ts`
- `src/web/logs/to_log_lines.ts`
- `src/web/logs/event_renderers.tsx`
- `src/web/logs/log_filters.tsx`
- `src/web/logs/to_log_lines.test.ts`
- `src/web/logs/use_node_run_logs.test.tsx`
  Alterar:
- `src/web/canvas/live/node_run_detail.tsx` (aba Logs)
- `src/web/logs/log_viewer.tsx` (prop `renderLine` opcional)

### Contratos

```ts
export function toLogLines(events: StoredLogEvent[], startedAt: Date): LogLine[];
// text → kind "text"; tool_call → kind "tool_call", text = "▸ <name>", detail = args formatados (JSON indentado quando possível);
// raw com JSON de resultado de ferramenta → "tool_result" recolhido; raw comum → "system" em muted (oculto no filtro "só texto");
// system → "system"; offsetMs = at - startedAt
export function useNodeRunLogs(
    nodeRunId: string,
    runId: string,
): { lines: LogLine[]; loading: boolean; complete: boolean; error?: ApiError };
// carrega em páginas de 2 000 até o fim; depois assina log.appended do run e busca a faixa nova (fromSeq)
```

### Passo a passo

1. Conversão pura com testes (inclui args JSON e não JSON).
2. Hook com paginação e incremental; deduplica por `seq`.
3. Renderizadores e filtros; download via `GET /api/node-runs/:id/logs/raw`.
4. Botão "tela cheia" abre o LogViewer num Dialog grande.

### Notas de design

Ver PRD "Logs": JetBrains Mono 13 px, tool calls com nome em `--color-steel`, erro com faixa vermelha, offset `+00:42`.
O filtro padrão é "texto + ferramentas" (bruto oculto).

## Critérios de aceite

- [ ] Abrir um NodeRun concluído mostra todos os eventos em ordem.
- [ ] Num NodeRun rodando, novos eventos aparecem sem recarregar e o viewer segue o fim.
- [ ] Tool calls aparecem recolhidas com o nome e expandem com os argumentos.
- [ ] Filtro "bruto" mostra as linhas `raw`.
- [ ] Baixar devolve o arquivo NDJSON.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `to_log_lines.test.ts`; `use_node_run_logs.test.tsx` (API e SSE mockados: histórico + incremental + dedupe).
