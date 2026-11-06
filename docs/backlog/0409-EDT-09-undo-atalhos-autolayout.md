---
key: EDT-09
title: "Desfazer/refazer, copiar/colar, atalhos e auto-layout"
type: issue
milestone: "Fase 4 — Editor visual"
labels: [tipo:feature, area:editor]
depends_on: [EDT-08]
---

## Contexto

Atende RF-EDT-06. Editar um fluxo é trabalho de ferramenta: o usuário espera Ctrl+Z, copiar um nó com sua config e
organizar o grafo automaticamente. Como toda mutação passa por `applyGraph` (#{EDT-01}), o histórico é uma pilha de
grafos.

## Objetivo

O editor tem desfazer/refazer (100 passos), copiar/colar/duplicar nós e grupos com ids novos, atalhos documentados e
"Organizar" (auto-layout com elkjs respeitando grupos).

## Escopo

**Inclui:** histórico, clipboard interno (e do sistema como JSON), duplicar, atalhos, auto-layout, diálogo de atalhos (`?`).
**Não inclui:** colaboração em tempo real.

## Especificação técnica

### Arquivos

Criar:

- `src/web/canvas/history.ts`
- `src/web/canvas/clipboard.ts`
- `src/web/canvas/shortcuts.ts`
- `src/web/canvas/auto_layout.ts`
- `src/web/canvas/shortcuts_dialog.tsx`
- `src/web/canvas/history.test.ts`
- `src/web/canvas/clipboard.test.ts`
- `src/web/canvas/auto_layout.test.ts`
  Alterar:
- `src/web/canvas/editor_store.ts` (`undo`, `redo`, `canUndo`, `canRedo`; agrupa mudanças em até 500 ms num passo)
- `src/web/canvas/flow_canvas.tsx` (atalhos e botão "Organizar")

### Contratos

```ts
export function createHistory(limit: number): {
    push(g: FlowGraph): void;
    undo(current: FlowGraph): FlowGraph | undefined;
    redo(current: FlowGraph): FlowGraph | undefined;
    canUndo: boolean;
    canRedo: boolean;
};
export function copySelection(graph: FlowGraph, ids: string[]): FlowFragment; // nós, grupos internos e arestas entre eles
export function pasteFragment(
    graph: FlowGraph,
    fragment: FlowFragment,
    at: { x: number; y: number },
    newId: () => string,
): { graph: FlowGraph; pastedIds: string[] };
export async function autoLayout(graph: FlowGraph): Promise<FlowGraph>; // elk "layered", direção RIGHT, grupos como compound nodes
export const SHORTCUTS: { keys: string; action: string }[];
```

Atalhos: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z (e Ctrl+Y), Ctrl/Cmd+C, Ctrl/Cmd+V, Ctrl/Cmd+D (duplicar), Delete, Ctrl/Cmd+A,
`G M`, `G L`, Shift+1 (ajustar à tela), `?` (ajuda). Atalhos não disparam com foco em campos de texto/CodeMirror.
Colar não duplica o trigger (é ignorado com toast).

### Passo a passo

1. Histórico e integração no store.
2. Clipboard: copia também para `navigator.clipboard` como `application/json` (texto) — colar de outro fluxo funciona.
3. Auto-layout com elk; resultado passa por `applyGraph` (desfazível).
4. Atalhos e diálogo.

## Critérios de aceite

- [ ] Mover, criar e apagar nós são desfeitos e refeitos na ordem certa.
- [ ] Copiar um map com seus nós e colar cria cópias com ids novos e arestas internas preservadas.
- [ ] "Organizar" reposiciona sem sobrepor nós e mantém nós dentro dos seus grupos.
- [ ] Ctrl+Z com o foco no editor de prompt desfaz o texto, não o grafo.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `history.test.ts`, `clipboard.test.ts` (ids novos, arestas internas, trigger ignorado), `auto_layout.test.ts` (sem sobreposição; filhos dentro da moldura).
