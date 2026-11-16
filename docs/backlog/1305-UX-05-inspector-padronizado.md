---
key: UX-05
title: "Inspector padronizado: cabeçalho, abas Configurar/Dados/Ajuda, ajuda por campo e cartões de opção"
type: issue
milestone: "Fase 12 — Experiência de criação de fluxos"
labels: [tipo:feature, area:editor]
depends_on: [UX-02]
---

## Contexto

Atende RF-EDT-14 e RF-EDT-04 (épico #185). Cada inspector (`src/web/canvas/inspector/*_inspector.tsx`) é uma lista de
campos com rótulos técnicos ("Iterações", "Turnos", "Retentativas", "Sinal de conclusão") quase sem ajuda.
`NodeInspectorFrame` mostra só o rótulo e uma seção. O catálogo de #{UX-01} já tem `FieldDoc` para cada campo, e
#{UX-02} tem o `NodeDocView`. Esta issue dá a todos os inspectors a mesma estrutura.

## Objetivo

Todo inspector, de nó e de grupo, tem cabeçalho (ícone, título, tagline, botão Documentação, rótulo editável), as abas
**Configurar**, **Dados** e **Ajuda**, ajuda `ⓘ` em cada campo vinda do `FieldDoc`, cartões de opção para enums
curtos e campos `advanced` recolhidos em "Avançado".

## Escopo

**Inclui:** componentes de estrutura; `doc` nos campos; aba Dados mostrando entradas (quem está ligado em cada porta)
e a última amostra real; aba Ajuda com `NodeDocView`; migração de **todos** os inspectors e do inspector de grupo para
a nova estrutura, sem mudar o que cada um edita.
**Não inclui:** o seletor de dados (#{UX-07}); as mudanças de conteúdo da Decisão, do Comando e dos demais nós
(#{UX-09}, #{UX-11}, #{UX-13}); o "Formato da resposta" do Agente (#{UX-08}).

## Especificação técnica

### Arquivos

Criar:

- `src/web/canvas/inspector/inspector_header.tsx`
- `src/web/canvas/inspector/inspector_tabs.tsx` (`<InspectorTabs configure data help />`; a aba ativa é lembrada por
  tipo de nó em `localStorage`, com try/catch)
- `src/web/canvas/inspector/field_help.tsx` (`<FieldHelp doc={FieldDoc} />`: botão `ⓘ` com popover contendo a
  descrição, "Padrão: …" e as opções)
- `src/web/canvas/inspector/option_cards.tsx` (`<OptionCards value options onChange label />`: radiogroup acessível,
  com cartões de título e descrição)
- `src/web/canvas/inspector/advanced_section.tsx`
- `src/web/canvas/inspector/node_data_tab.tsx` (entradas: para cada porta de entrada, a origem "← Reviewer ›
  Resumo" ou "automático"/"não ligada"; saídas: label, tipo e descrição; se houver NodeRun anterior do nó, a última
  amostra de `inputs`/`outputs` em JSON recolhível)
- `src/web/canvas/inspector/use_last_node_run_sample.ts` (busca o último NodeRun do nó no fluxo pela API de runs que
  já existe; sem run anterior, devolve `undefined`)
- `src/web/canvas/inspector/inspector_tabs.test.tsx`, `field_help.test.tsx`, `option_cards.test.tsx`

Alterar:

- `src/web/canvas/inspector/node_inspector_frame.tsx` (usa header e abas; recebe `type`)
- `src/web/canvas/inspector/text_field.tsx`, `select_field.tsx`, `integer_field.tsx` (prop opcional `doc?: FieldDoc`;
  com `doc`, rótulo = `doc.label` e `FieldHelp` ao lado)
- `src/web/canvas/inspector/agent_inspector.tsx`, `trigger_inspector.tsx`, `source_inspector.tsx`,
  `script_inspector.tsx`, `condition_inspector.tsx`, `gate_inspector.tsx`, `git_inspector.tsx`, `output_inspector.tsx`,
  `execution_fields.tsx`, `tools_credential_fields.tsx`, `loop_fields.tsx` e o inspector de grupo (passar `doc` de cada
  campo; enums com até 4 valores viram `OptionCards`: workspace do Agente, provider da Fonte, ação do Git, destino da
  Saída)
- `src/web/canvas/inspector/other_inspectors.test.tsx`, `agent_inspector.test.tsx`

### Passo a passo

1. Crie `FieldHelp` e `OptionCards` e adicione `doc` aos campos base.
2. Crie `InspectorHeader` e `InspectorTabs` e troque `NodeInspectorFrame`.
3. Migre os inspectors um a um, buscando o `FieldDoc` com `getNodeDoc(type).fields.find(f => f.key === "...")` por meio
   de um helper `fieldDoc(type, key)` que lança erro em teste se a chave não existir.
4. Implemente a aba Dados.
5. Mova para `AdvancedSection` os campos com `advanced: true`.

### Notas de design

- Superfície: painel lateral do editor (configurações). O cabeçalho ocupa no máximo 2 linhas; as abas ficam fixas no
  topo ao rolar.
- `OptionCards`: cartões empilhados, título em `text-sm font-medium` e descrição em `text-xs text-muted`; o selecionado
  tem borda de destaque **e** ícone de check.
- Valores herdados aparecem como texto: "Padrão do projeto: sonnet · effort médio".
- Aba Dados sem run anterior: "Ainda não há execução deste nó. Rode o fluxo para ver dados reais aqui."
- Teclado: as abas usam o padrão WAI-ARIA tabs (setas); `ⓘ` abre com Enter e fecha com Esc.

## Critérios de aceite

- [ ] Os 8 inspectors de nó e o de grupo têm header, abas e ajuda `ⓘ` em todos os campos.
- [ ] O workspace do Agente, o provider da Fonte, a ação do Git e o destino da Saída são `OptionCards` com descrição.
- [ ] `idleTimeoutMinutes` e `expandPromptCommands` ficam em "Avançado".
- [ ] A aba Dados do `Reviewer` no fluxo padrão mostra `context ← Dev › Resumo` e `item` automático.
- [ ] A aba Ajuda mostra o `NodeDocView` do tipo.
- [ ] Nenhuma edição existente quebra (testes atuais dos inspectors continuam verdes).
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `field_help.test.tsx`: popover com descrição, padrão e opções; Esc fecha.
- `option_cards.test.tsx`: radiogroup, setas e `onChange`.
- `inspector_tabs.test.tsx`: troca de aba e lembrança por tipo (com `localStorage` lançando erro → não quebra).
- `other_inspectors.test.tsx`: cada inspector tem header e `ⓘ`; aba Dados com e sem run (API fake).
