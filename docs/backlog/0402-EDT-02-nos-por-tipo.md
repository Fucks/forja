---
key: EDT-02
title: "Nós customizados por tipo no canvas"
type: issue
milestone: "Fase 4 — Editor visual"
labels: [tipo:feature, area:editor]
depends_on: [EDT-01]
---

## Contexto

Atende RF-EDT-01 e RF-OBS-01. Cada tipo de nó mostra um resumo diferente no corpo: o agente mostra modelo, effort e
workspace; o script mostra o comando; o gate mostra a mensagem. O registro `node_components.ts` é criado aqui com
**todos os tipos de uma vez**, para que o editor e a execução ao vivo (#{OBS-01}) usem o mesmo componente.

## Objetivo

O canvas renderiza cada um dos oito tipos de nó com o componente certo e os grupos com `GroupFrame`, prontos para
receber um estado de execução opcional.

## Escopo

**Inclui:** oito componentes de nó, componente de grupo, registro `nodeTypes`/`groupTypes`, resumo por tipo (função pura).
**Não inclui:** edição das configs (#{EDT-05}, #{EDT-06}), dados ao vivo (#{OBS-01}).

## Especificação técnica

### Arquivos

Criar:

- `src/web/canvas/nodes/node_summary.ts`
- `src/web/canvas/nodes/agent_node.tsx`
- `src/web/canvas/nodes/simple_nodes.tsx` (trigger, source, script, condition, gate, git, output)
- `src/web/canvas/nodes/group_node.tsx`
- `src/web/canvas/nodes/node_components.ts`
- `src/web/canvas/nodes/node_live_context.ts`
- `src/web/canvas/nodes/node_summary.test.ts`
- `src/web/canvas/nodes/nodes.test.tsx`
  Alterar:
- `src/web/canvas/flow_canvas.tsx` (usar `nodeTypes` do registro)

### Contratos

```ts
export function summarizeNode(
    node: FlowNode,
    defaults?: { model: string; effort: Effort },
): { line1: string; line2?: string };
// agent: "opus-5-5 · effort high" / "workspace do item · até 50 iterações"; herdado do projeto aparece como "padrão"
// script: comando truncado em 40 chars; condition: condição em texto ("review.approved = true")
// gate: mensagem truncada; git: "abrir PR → development"; source: "GitHub · label Sandcastle · até 20"; trigger: "manual" etc.
export function describeGroupConfig(group: FlowGroup): string; // "map ×3", "map ×1 · barreira", "loop ≤3"

export const nodeTypes: NodeTypes; // chaves = NODE_TYPES + "group"
// Contexto opcional preenchido pela execução ao vivo (#{OBS-01}); no editor fica vazio
export interface NodeLiveState {
    status?: ExecutionStatus;
    badge?: string;
    progress?: GroupProgress;
}
export const NodeLiveContext: React.Context<Map<string, NodeLiveState>>;
```

### Passo a passo

1. `summarizeNode` e `describeGroupConfig` puros com testes.
2. Componentes usando `BaseNode`/`GroupFrame` e lendo `NodeLiveContext` pelo id.
3. Registro e uso no `FlowCanvas`.

### Notas de design

Nó `agent` é o mais importante visualmente: 240 px, linha 1 em mono 12 px. Ícones de tipo de `NODE_TYPE_ICONS`.
Grupos: `GroupFrame` com `describeGroupConfig` no rótulo.

## Critérios de aceite

- [ ] Cada um dos oito tipos renderiza com ícone, rótulo e resumo corretos.
- [ ] Grupos mostram "map ×3" / "loop ≤3".
- [ ] Um `NodeLiveState` com `status: "RUNNING"` no contexto faz o nó exibir o estado (verificado em teste).
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `node_summary.test.ts`: um caso por tipo e para valores herdados.
- `nodes.test.tsx`: render de cada tipo; estado vindo do contexto.
