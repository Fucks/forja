---
key: UX-04
title: "Portas com nome amigável, tipo e tooltip; selos de item automático e falta configurar"
type: issue
milestone: "Fase 12 — Experiência de criação de fluxos"
labels: [tipo:feature, area:editor]
depends_on: [UX-01]
---

## Contexto

Atende RF-EDT-14 (épico #185). As portas mostram só o nome técnico (`src/web/canvas/base/port_handle.tsx`: `item`,
`context`, `result`, `summary`), sem tipo e sem explicação. No fluxo padrão, o nó `Dev` recebe o item **sem aresta
nenhuma** (dentro de um Map o item é implícito, ver `src/engine/node_inputs.ts`), e nada na tela diz isso. Um nó sem
prompt ou sem comando só aparece no painel de problemas. Com o catálogo de #{UX-01}, cada porta e cada nó podem se
explicar.

## Objetivo

Cada porta mostra o nome amigável e o ícone do tipo, e o tooltip traz a descrição, o nome técnico, o tipo e se é
obrigatória. A porta `item` implícita dentro de um Map tem o selo "automático". Nós com erro de configuração mostram o
selo "falta configurar". O cabeçalho do nó ganha o botão `?`, e os resumos usam linguagem natural.

## Escopo

**Inclui:** `PortHandle` com label e ícone; `description?` no `Port`; selos; botão `?` (abre `NodeDocDrawer` de
#{UX-02} quando existir; até lá, abre `/docs/nodes/:type` numa aba nova); resumos em linguagem natural.
**Não inclui:** o espaço de nomes de dados e as frases da Decisão com caminhos (#{UX-09}); o resumo do Comando novo
(#{UX-11}).

## Especificação técnica

### Arquivos

Criar:

- `src/web/canvas/base/port_type_icons.ts` (`PORT_TYPE_ICONS: Record<PortType, LucideIcon>` e `PORT_TYPE_LABELS`: lista
  de itens, item, texto, JSON, branch, URL de PR, qualquer)
- `src/web/canvas/base/port_label.ts` (`describePort(nodeType, port): { label; description }`: usa o `PortDoc` do
  catálogo e, para portas criadas pelo usuário, `port.description` ou o próprio nome)
- `src/web/canvas/base/port_label.test.ts`
- `src/web/canvas/nodes/node_badges.tsx` (`ImplicitItemBadge`, `NeedsConfigBadge`)

Alterar:

- `src/shared/flow_graph.ts` (`portSchema` ganha `description: z.string().max(200).optional()`; mudança aditiva)
- `src/shared/normalize_flow_graph.ts` (ordem de chaves da porta inclui `description`)
- `src/web/canvas/base/port_handle.tsx` (label amigável, ícone do tipo, tooltip com descrição, `name`, tipo e "obrigatória"/"opcional")
- `src/web/canvas/base/base_node.tsx` (botão `?` no cabeçalho, com `aria-label="Documentação de <título>"`; selos)
- `src/web/canvas/nodes/node_summary.ts` (frases: Fonte "GitHub · label Sandcastle · até 20 itens"; Saída "Move para
  Concluído"; Gatilho "Dispara manualmente"; Agente sem alteração)
- `src/web/canvas/inspector/port_list_editor.tsx` (campo "Descrição" para portas do usuário)
- testes existentes de `nodes.test.tsx`, `base_node.test.tsx` e `node_summary.test.ts`

### Regras

- **Item automático:** a porta de entrada `item` sem aresta, num nó cujo escopo é por item (dentro de um Map), mostra o
  selo "item atual · automático", com o tooltip "Dentro de um Map, cada nó recebe o item que está sendo processado.
  Não precisa ligar.". Use a mesma regra de escopo do motor (`computeNodeScopes` em `src/engine/node_scopes.ts`;
  confirme o nome exportado).
- **Falta configurar:** o nó tem pelo menos um `ValidationIssue` de nível `error` com `target.kind === "node"` e o id
  dele (vindo de `use_editor_issues.ts`). O selo mostra o ícone `AlertTriangle` e o texto "falta configurar"; clicar
  seleciona o nó e abre o inspector.

### Notas de design

- O estado de erro também usa forma e ícone, não só cor (PRD, direção de design).
- O label da porta tem no máximo 18 caracteres visíveis (ellipsis); o completo fica no tooltip.
- Os selos não aparecem com zoom abaixo de 0,6 (densidade sob controle).

## Critérios de aceite

- [ ] A porta `result` do Agente aparece como "Resultado" com o ícone de JSON; o tooltip mostra a descrição, `result`,
      "JSON" e "obrigatória".
- [ ] No fluxo padrão, `Dev.item` (sem aresta, dentro do Map "Desenvolver") mostra o selo "automático"; um Agente fora
      de Map, não.
- [ ] Um Agente com prompt vazio mostra "falta configurar"; preencher o prompt remove o selo.
- [ ] `?` abre a documentação do tipo.
- [ ] Uma porta do usuário com descrição mostra essa descrição no tooltip, e a descrição vai e volta no export/import YAML.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `port_label.test.ts`: porta padrão, porta do usuário com e sem descrição.
- `nodes.test.tsx`: selo automático dentro e fora de Map; selo de falta configurar; botão `?` acessível.
- `node_summary.test.ts`: frases novas.
- `flow_yaml.test.ts`: ida e volta com `description`.
