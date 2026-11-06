---
key: EDT-01
title: "Canvas do editor carregando e salvando o rascunho"
type: issue
milestone: "Fase 4 — Editor visual"
labels: [tipo:feature, area:editor]
depends_on: [DS-05, FLW-04, F-09]
---

## Contexto

Atende RF-EDT-01. O editor visual é o diferencial do produto. Com a base visual de #{DS-05} e a API de rascunho de
#{FLW-04}, esta issue liga React Flow aos dados: abre o rascunho, permite mover nós e grupos e salva sozinho. Tudo
que as próximas issues do editor fazem passa pelo `editor_store` e pelo mapeamento criados aqui.

## Objetivo

Em `/projects/:projectId/flows/:flowId` o usuário vê o rascunho do fluxo no canvas (pan, zoom, minimapa), move nós e
grupos, e as mudanças são salvas automaticamente com controle de revisão.

## Escopo

**Inclui:** `FlowEditorPage`, `FlowCanvas`, `editor_store` (Zustand), mapeamento puro `FlowGraph` ↔ nós/arestas do
React Flow, autosave com debounce, conflito de revisão, nós renderizados com um componente genérico provisório.
**Não inclui:** nós por tipo (#{EDT-02}), paleta (#{EDT-03}), conexão (#{EDT-04}), inspector (#{EDT-05}).

## Especificação técnica

### Arquivos

Criar:

- `src/web/canvas/graph_mapping.ts`
- `src/web/canvas/editor_store.ts`
- `src/web/canvas/flow_canvas.tsx`
- `src/web/canvas/use_flow_draft.ts`
- `src/web/canvas/autosave.ts`
- `src/web/canvas/graph_mapping.test.ts`
- `src/web/canvas/editor_store.test.ts`
- `src/web/canvas/autosave.test.ts`
- `src/web/canvas/flow_canvas.test.tsx`
  Alterar:
- `src/web/app/flows/flow_editor_page.tsx` (substituir o placeholder)

### Contratos

```ts
// graph_mapping.ts (puro)
export function toReactFlow(graph: FlowGraph): { nodes: RFNode[]; edges: RFEdge[] }; // grupos viram nós "group" com parentId
export function fromReactFlow(nodes: RFNode[], edges: RFEdge[], previous: FlowGraph): FlowGraph; // preserva configs
// posições: React Flow usa posição relativa ao pai; FlowGraph guarda absoluta → converter nos dois sentidos

// editor_store.ts
export interface EditorState {
    flowId: string;
    graph: FlowGraph;
    revision: number;
    dirty: boolean;
    selection: string[];
    saveState: "idle" | "saving" | "saved" | "conflict" | "error";
    load(draft: FlowDraft): void;
    applyGraph(update: (g: FlowGraph) => FlowGraph): void; // toda mutação passa por aqui (undo em #{EDT-09})
    select(ids: string[]): void;
    markSaved(revision: number): void;
    markConflict(): void;
}
export function createEditorStore(): UseBoundStore<StoreApi<EditorState>>;

// autosave.ts
export function createAutosave(opts: {
    delayMs: number;
    save(graph: FlowGraph, revision: number): Promise<number>;
    onConflict(): void;
    setTimer: Clock["setTimeout"];
}): { schedule(graph: FlowGraph, revision: number): void; flush(): Promise<void> };
```

Nó provisório: renderiza `BaseNode` com ícone e rótulo do tipo (substituído por componentes por tipo em #{EDT-02}).

### Passo a passo

1. Mapeamento puro com testes de ida e volta (incluindo nós dentro de grupos aninhados).
2. Store com `applyGraph` imutável; seleção sincronizada com o React Flow.
3. `useFlowDraft(flowId)` busca o rascunho e alimenta o store.
4. Autosave 800 ms após a última mudança; `flush` ao sair da página (`beforeunload` e desmontagem).
5. Conflito (409): banner "O fluxo foi alterado em outra aba. Recarregar?" com botão que recarrega o rascunho.
6. Canvas com `Background` (pontos), `MiniMap`, `Controls`, zoom 25%–200%, `fitView` na abertura; modo compacto dos nós abaixo de 50%.
7. Barra superior da página: nome do fluxo, estado do salvamento ("Salvo", "Salvando…", "Conflito").

### Notas de design

Superfície canvas: ocupa toda a área útil; paleta à esquerda (240 px, vazia até #{EDT-03}) e inspector à direita
(360 px, vazio até #{EDT-05}), ambos recolhíveis. Indicador de salvamento discreto em `--color-text-muted`.

## Critérios de aceite

- [ ] Abrir um fluxo mostra todos os nós e grupos nas posições salvas, com `fitView`.
- [ ] Mover um nó dentro de um grupo mantém a posição correta após recarregar.
- [ ] Mudanças são salvas 800 ms após a última edição; recarregar mostra o estado salvo.
- [ ] Revisão desatualizada mostra o banner de conflito e não sobrescreve.
- [ ] Sair da página com mudanças pendentes faz `flush`.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `graph_mapping.test.ts`: ida e volta com `buildCanonicalFlow()` e `buildLoopFlow()`, posições relativas/absolutas.
- `editor_store.test.ts`: `applyGraph`, `dirty`, seleção.
- `autosave.test.ts` (FakeClock): debounce, conflito, flush.
- `flow_canvas.test.tsx` (`ResizeObserver` mockado): renderiza os nós do fluxo canônico.
