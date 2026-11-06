---
key: EDT-07
title: "Agrupar seleção em loop ou map no canvas"
type: issue
milestone: "Fase 4 — Editor visual"
labels: [tipo:feature, area:editor]
depends_on: [EDT-06]
---

## Contexto

Atende RF-EDT-03 — o pedido do usuário de "agrupar para criar um loop ou um processamento concorrente" direto na
visualização. Selecionar o nó Dev e escolher "Agrupar em map" com concorrência 3 é exatamente o exemplo do PRD.
Grupos aninham (loop dentro de map). A condição do loop usa o `ConditionEditor` de #{EDT-06}.

## Objetivo

O usuário seleciona nós, escolhe "Agrupar em map" ou "Agrupar em loop", ajusta a config do grupo no inspector e pode
desagrupar, mover e redimensionar grupos; o rascunho resultante passa na validação quando a estrutura é coerente.

## Escopo

**Inclui:** agrupar/desagrupar (puros), barra de ação de seleção e menu de contexto, moldura com tamanho calculado,
inspector do grupo (map: concorrência, barreira, failFast; loop: teto, condição, carry), arrastar nó para dentro/fora de grupo.
**Não inclui:** exibição de progresso ao vivo (#{OBS-01}).

## Especificação técnica

### Arquivos

Criar:

- `src/web/canvas/grouping.ts`
- `src/web/canvas/grouping.test.ts`
- `src/web/canvas/selection_toolbar.tsx`
- `src/web/canvas/inspector/group_inspector.tsx`
- `src/web/canvas/inspector/group_inspector.test.tsx`
  Alterar:
- `src/web/canvas/flow_canvas.tsx` (toolbar de seleção, menu de contexto, `onNodeDragStop` para reparentar)
- `src/web/canvas/inspector/inspector_panel.tsx` (grupo selecionado → `GroupInspector`)

### Contratos

```ts
export type GroupingVerdict = { ok: true } | { ok: false; reason: string };
export function canGroup(graph: FlowGraph, nodeIds: string[]): GroupingVerdict;
// motivos: "Selecione ao menos um nó", "Os nós precisam estar no mesmo grupo", "O trigger não pode ficar dentro de um grupo"
export function groupNodes(
    graph: FlowGraph,
    nodeIds: string[],
    kind: "map" | "loop",
    newId: () => string,
): { graph: FlowGraph; groupId: string };
// cria o grupo com a moldura envolvendo os nós (padding 40 px, 32 px no topo para o rótulo), parentGroupId = pai comum
export function ungroup(graph: FlowGraph, groupId: string): FlowGraph; // filhos sobem para o pai do grupo; arestas mantidas
export function reparentNode(
    graph: FlowGraph,
    nodeId: string,
    point: { x: number; y: number },
): FlowGraph; // ao soltar dentro/fora de um grupo
export function fitGroupToChildren(graph: FlowGraph, groupId: string): FlowGraph;
```

Defaults: map `concurrency 1`, loop `maxIterations 3`, `until: { op: "exists", path: "" }` (marca erro até o usuário definir).

### Passo a passo

1. Funções puras com testes (grupos aninhados, posições absolutas preservadas).
2. Com 1+ nós selecionados, toolbar flutuante: "Agrupar em map", "Agrupar em loop" (desabilitados com tooltip do motivo); atalhos `G M` e `G L`.
3. Menu de contexto do grupo: "Desagrupar", "Ajustar ao conteúdo".
4. `GroupInspector`: map → Slider/Input de concorrência (1–16) com texto "até N itens ao mesmo tempo", Switch "esperar todos (barreira)", Switch "parar todos na primeira falha"; loop → teto (1–50), `ConditionEditor` da condição de saída ("repetir até…"), lista de portas `carry`.
5. Reparentar ao soltar um nó dentro/fora de um grupo.

### Notas de design

Grupo map com ícone `Layers`; loop com `Repeat`. A moldura do grupo selecionado ganha alças de redimensionar. O rótulo
mostra `describeGroupConfig` (ex.: "map ×3").

## Critérios de aceite

- [ ] Selecionar o nó Dev e "Agrupar em map" cria um grupo que envolve o nó; definir concorrência 3 muda o rótulo para "map ×3".
- [ ] Agrupar nós de grupos diferentes é bloqueado com o motivo.
- [ ] Loop dentro de map funciona e desagrupar o loop devolve os nós ao map.
- [ ] Arrastar um nó para fora do grupo remove o `parentGroupId`.
- [ ] Loop sem condição definida aparece como erro na validação.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `grouping.test.ts`: canGroup, groupNodes (moldura e pai), ungroup, reparent, aninhamento.
- `group_inspector.test.tsx`: editar concorrência e condição.
