---
key: UX-03
title: "Paleta por categorias, cartão de detalhes, Map e Loop na paleta e adicionar a partir da porta"
type: issue
milestone: "Fase 12 — Experiência de criação de fluxos"
labels: [tipo:feature, area:editor]
depends_on: [UX-02]
---

## Contexto

Atende RF-EDT-14 e RF-EDT-03 (épico #185). A paleta atual (`src/web/canvas/palette/node_palette.tsx`) é uma lista
plana com uma frase por nó. Map e Loop **não aparecem nela**: só dá para criá-los selecionando nós e usando
`src/web/canvas/selection_toolbar.tsx`, coisa que um leigo não descobre. Com o catálogo de #{UX-01} e o
`NodeDocDrawer` de #{UX-02}, a paleta passa a se explicar sozinha.

## Objetivo

A paleta mostra os nós por categoria, com um cartão de detalhes e o link para a documentação completa. Map e Loop
podem ser arrastados da paleta, e soltar uma ligação no vazio abre um menu com os nós compatíveis, já ligado.

## Escopo

**Inclui:** categorias, cartão de detalhes (hover ou foco), botão "Documentação completa" (abre `NodeDocDrawer`),
grupos na paleta, busca em `whenToUse`, menu de adicionar a partir da porta.
**Não inclui:** mudanças no nó e nas portas (#{UX-04}); mudanças no inspector (#{UX-05}).

## Especificação técnica

### Arquivos

Criar:

- `src/web/canvas/palette/node_palette_detail.tsx` (cartão: tagline, o que faz, entradas e saídas com label e ícone do
  tipo, primeiro exemplo, botão "Documentação completa")
- `src/web/canvas/palette/add_from_port_menu.tsx` (menu com busca, posicionado no ponto de soltura)
- `src/web/canvas/palette/compatible_node_types.ts` (`listCompatibleNodeTypes(portType, handleType): NodeType[]`, que
  reutiliza `connection_rules.ts`)
- `src/web/canvas/palette/compatible_node_types.test.ts`

Alterar:

- `src/web/canvas/palette/palette_items.ts` (`PaletteItem` ganha `category` e `kind: "node" | "group"`; entradas
  `map` e `loop`; `filterPaletteItems` também procura em `whenToUse`)
- `src/web/canvas/palette/node_palette.tsx` (seções por categoria, recolhíveis, na ordem de `NODE_CATEGORIES`)
- `src/web/canvas/palette/node_type_drag.ts` e `use_node_drop.ts` (arrastar um grupo)
- `src/web/canvas/palette/use_add_node.ts` (`addGroupAtViewportCenter(kind)`)
- `src/web/canvas/grouping.ts` (`createEmptyGroup(kind, position)`; com nós selecionados, o grupo envolve a seleção,
  reutilizando a função de agrupar que já existe)
- `src/web/canvas/flow_canvas.tsx` (`onConnectEnd` no vazio abre `AddFromPortMenu`; escolher um tipo cria o nó na
  posição e a aresta da porta de origem para a primeira porta compatível)
- `src/web/canvas/palette/node_palette.test.tsx`

### Contratos

```ts
export interface PaletteItem {
    type: NodeType | GroupKind;
    kind: "node" | "group";
    category: NodeCategory;
    label: string;
    description: string; // tagline
    icon: LucideIcon;
    singleton?: boolean;
}
export function listCompatibleNodeTypes(portType: PortType, from: "source" | "target"): NodeType[];
```

### Passo a passo

1. Estenda `PaletteItem` e gere as entradas a partir de `NODE_DOCS`.
2. Agrupe por categoria em `NodePalette` (cabeçalho de seção com `CATEGORY_LABELS`).
3. Faça o cartão de detalhes com o `Tooltip`/popover do design system, abrindo no hover (atraso de 300 ms) e no foco do
   teclado.
4. Map e Loop: soltar no canvas chama `createEmptyGroup`. O grupo vazio mostra, dentro da moldura, o texto "Arraste
   nós para dentro".
5. `onConnectEnd` sem alvo abre `AddFromPortMenu` filtrado por `listCompatibleNodeTypes`. Esc fecha sem criar nada.

### Notas de design

- Superfície: canvas. Seções com rótulo em caixa alta pequena e contagem; o ícone do tipo em `text-steel`.
- O cartão tem no máximo 320 px de largura, a mesma elevação dos popovers e o botão "Documentação completa" como link
  secundário.
- Teclado: setas navegam entre as entradas; Enter adiciona no centro; Shift+F10 ou a tecla de menu abre o cartão.
- Singleton (Gatilho) já usado continua com o tooltip atual.

## Critérios de aceite

- [ ] A paleta mostra as categorias na ordem Início → Grupos, com Map e Loop em "Grupos".
- [ ] Buscar "testes" encontra Comando; buscar "aprovar" encontra Aprovação humana e Decisão.
- [ ] O cartão mostra entradas e saídas com nomes amigáveis; "Documentação completa" abre o drawer do tipo.
- [ ] Arrastar Map para o vazio cria um grupo vazio; com 2 nós selecionados, clicar em Map os envolve.
- [ ] Soltar uma aresta de `items` (lista) no vazio oferece só os nós que aceitam essa porta e cria nó e aresta.
- [ ] Esc no menu não cria nada; desfazer (Ctrl+Z) remove nó e aresta juntos.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `compatible_node_types.test.ts`: lista/item/texto/json/any × origem/destino.
- `node_palette.test.tsx`: categorias, busca em `whenToUse`, cartão por teclado, adicionar grupo.
- `flow_canvas.test.tsx`: `onConnectEnd` no vazio abre o menu; escolher cria nó e aresta numa única entrada de
  histórico.
