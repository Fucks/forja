---
key: EDT-03
title: "Paleta de nós: arrastar para criar"
type: issue
milestone: "Fase 4 — Editor visual"
labels: [tipo:feature, area:editor]
depends_on: [EDT-02]
---

## Contexto

Atende RF-EDT-01: o usuário cria nós direto na visualização. A paleta lista os tipos com descrição curta e cria o
nó com portas e config padrão (`createDefaultNode` de #{FLW-01}) onde for solto; soltar sobre um grupo cria o nó
dentro dele.

## Objetivo

O usuário arrasta um tipo da paleta para o canvas (ou clica e o nó aparece no centro da vista) e o nó é criado no
rascunho, dentro do grupo sob o cursor quando houver.

## Escopo

**Inclui:** painel de paleta, arrastar e soltar, criar por clique, busca na paleta, impedir segundo `trigger`.
**Não inclui:** criar grupos (#{EDT-07}).

## Especificação técnica

### Arquivos

Criar:

- `src/web/canvas/palette/palette_items.ts`
- `src/web/canvas/palette/node_palette.tsx`
- `src/web/canvas/palette/drop_target.ts`
- `src/web/canvas/palette/drop_target.test.ts`
- `src/web/canvas/palette/node_palette.test.tsx`
  Alterar:
- `src/web/canvas/flow_canvas.tsx` (handlers `onDrop`/`onDragOver`)
- `src/web/app/flows/flow_editor_page.tsx` (montar a paleta à esquerda)

### Contratos

```ts
export interface PaletteItem {
    type: NodeType;
    label: string;
    description: string;
    icon: LucideIcon;
    singleton?: boolean;
}
export const PALETTE_ITEMS: PaletteItem[]; // ordem: trigger, source, agent, script, condition, gate, git, output
export function findDropGroup(
    graph: FlowGraph,
    point: { x: number; y: number },
): string | undefined; // grupo mais interno que contém o ponto
export function addNodeAt(
    graph: FlowGraph,
    type: NodeType,
    point: { x: number; y: number },
    newId: () => string,
): FlowGraph;
```

Descrições: agent "Prompt em contexto limpo no Claude Code"; script "Comando no workspace do item (ex.: testes)";
condition "Desvia por uma regra sobre os dados"; gate "Espera aprovação humana"; git "Rebase, push ou PR";
source "Busca itens (GitHub ou locais)"; trigger "Início do fluxo (um por fluxo)"; output "Fim: move o item no board".

### Passo a passo

1. Itens da paleta e funções puras `findDropGroup` e `addNodeAt` (converte a posição de tela com `screenToFlowPosition`).
2. Arrastar com `dataTransfer` (`application/forja-node-type`); clicar cria no centro da vista.
3. `trigger` desabilitado na paleta quando já existe um (tooltip explica).
4. Nó recém-criado fica selecionado.

### Notas de design

Lista vertical com ícone, nome e descrição em `--color-text-muted`; campo de busca no topo. Durante o arraste, o grupo
sob o cursor destaca a borda em `--color-accent`.

## Critérios de aceite

- [ ] Arrastar "Agente" para o canvas cria um nó agent com portas padrão na posição solta.
- [ ] Soltar dentro de um map cria o nó com `parentGroupId` do map (grupo mais interno, se aninhado).
- [ ] O item trigger fica desabilitado quando o fluxo já tem um.
- [ ] Busca filtra itens por nome e descrição.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `drop_target.test.ts`: grupo mais interno, fora de grupos, `addNodeAt` com ids determinísticos.
- `node_palette.test.tsx`: busca, trigger desabilitado, clique cria nó (store).
