---
key: QA-02
title: "Desempenho do canvas, dos logs e do motor"
type: issue
milestone: "Fase 11 — Qualidade e lançamento"
labels: [tipo:qualidade, area:editor]
depends_on: [QA-01]
---

## Contexto

Atende RNF-DES-01, RNF-DES-02 e RNF-DES-03. O canvas deve ficar fluido com 150 nós, o LogViewer com 100 mil linhas e o
motor não pode ser gargalo com dezenas de itens. Esta issue cria verificações repetíveis e corrige o que elas acharem.

## Objetivo

Existem testes de desempenho automatizados (fora do `npm run test` padrão, em `npm run test:perf`) com metas explícitas, e
as metas são atingidas.

## Escopo

**Inclui:** gerador de grafo grande, medição de render/atualização do canvas, LogViewer com 100 mil linhas, scheduler com 100
itens × 5 nós, otimizações necessárias (memo nos nós, seletores do store, batch de eventos).
**Não inclui:** testes de carga do servidor HTTP.

## Especificação técnica

### Arquivos

Criar:

- `src/test/factories/large_flow_factory.ts`
- `src/web/canvas/canvas.perf.test.tsx`
- `src/web/logs/log_viewer.perf.test.tsx`
- `src/engine/scheduler.perf.test.ts`
- `vitest.perf.config.ts`
  Alterar:
- `package.json` (script `test:perf`)
- Componentes onde a medição apontar problema (registre cada otimização no PR com antes/depois)

### Contratos e metas

- `buildLargeFlow({ nodes: 150, groups: 10 })`.
- Canvas: montar 150 nós < 1 s em jsdom; aplicar 500 eventos `node_run.updated` em lote atualiza só os nós afetados
  (conte renders com um contador no `NodeLiveContext`).
- LogViewer: montar com 100 mil linhas < 500 ms; anexar 1 000 linhas < 50 ms.
- Scheduler: 100 itens × 5 nós no `FakeAgentRuntime` termina com `handle` médio < 2 ms por evento.

### Passo a passo

1. Fábrica e configs.
2. Testes com `performance.now()` e limites com folga para CI (×2).
3. Otimizações onde falhar.

## Critérios de aceite

- [ ] `npm run test:perf` passa com as metas acima.
- [ ] Atualizar o estado de um nó não re-renderiza os outros 149 (teste de contagem).
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

Os próprios testes de desempenho.
