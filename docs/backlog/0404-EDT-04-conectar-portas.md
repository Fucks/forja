---
key: EDT-04
title: "Conectar portas com validação de tipo"
type: issue
milestone: "Fase 4 — Editor visual"
labels: [tipo:feature, area:editor]
depends_on: [EDT-03]
---

## Contexto
Atende RF-EDT-02. Entradas e saídas tipadas são o contrato entre nós de contexto limpo. Uma aresta que liga `text` a
`workItemList` gera uma run quebrada; o editor deve recusar a conexão durante o arraste e explicar por quê, usando
as mesmas regras do servidor (`areTypesCompatible` de #{FLW-02}).

## Objetivo
O usuário liga uma porta de saída a uma de entrada arrastando; conexões incompatíveis são bloqueadas com explicação;
arestas podem ser selecionadas e removidas; nós e arestas podem ser removidos com Delete.

## Escopo
**Inclui:** `isValidConnection`, feedback visual durante o arraste, criar/remover arestas, remover nós (e suas arestas),
uma aresta por porta de entrada (nova conexão substitui a anterior).
**Não inclui:** adicionar portas customizadas ao agente (#{EDT-05}).

## Especificação técnica
### Arquivos
Criar:
- `src/web/canvas/connection_rules.ts`
- `src/web/canvas/connection_rules.test.ts`
- `src/web/canvas/edge_actions.ts`
- `src/web/canvas/edge_actions.test.ts`
Alterar:
- `src/web/canvas/flow_canvas.tsx` (`onConnect`, `isValidConnection`, `onEdgesDelete`, `onNodesDelete`)

### Contratos
```ts
export type ConnectionVerdict = { ok: true } | { ok: false; reason: string };
export function checkConnection(graph: FlowGraph, from: { nodeId: string; port: string }, to: { nodeId: string; port: string }): ConnectionVerdict;
// motivos: "Tipos incompatíveis: text → workItemList", "Um nó não pode se ligar a si mesmo",
// "Isto cria um ciclo fora de um loop", "Saída → saída não é permitido"
export function connect(graph: FlowGraph, from: PortRef, to: PortRef, newId: () => string): FlowGraph; // substitui aresta existente na entrada
export function removeEdges(graph: FlowGraph, edgeIds: string[]): FlowGraph;
export function removeNodes(graph: FlowGraph, nodeIds: string[]): FlowGraph; // remove arestas ligadas
```
Usa `areTypesCompatible`, `isItemCorrelatedEdge` e a detecção de ciclo de `src/engine/graph_queries.ts` (#{FLW-02}).

### Passo a passo
1. Regras puras e testes.
2. Durante o arraste, portas compatíveis destacam em `--color-accent` e incompatíveis ficam opacas; soltar numa
   incompatível mostra tooltip com o motivo por 3 s.
3. Delete/Backspace remove a seleção; o trigger pode ser removido (a validação de #{EDT-08} reclama).

### Notas de design
Aresta selecionada: 2 px `--color-accent`. Tooltip de motivo junto ao cursor, `--color-surface-raised`.

## Critérios de aceite
- [ ] Ligar `agent.summary (text)` a `agent.context (text)` cria a aresta.
- [ ] Ligar `text` a `workItemList` é bloqueado com o motivo.
- [ ] Conexão que fecharia ciclo fora de loop é bloqueada; dentro de loop é permitida.
- [ ] Nova conexão numa entrada já ligada substitui a anterior.
- [ ] Remover um nó remove suas arestas.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `connection_rules.test.ts`: cada motivo, compatíveis, ciclo dentro/fora de loop.
- `edge_actions.test.ts`: substituição na entrada, remoção em cascata.
