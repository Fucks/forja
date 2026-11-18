---
key: UX-13
title: "Ajustes de Fonte, Gatilho, Aprovação, Git, Saída, Map e Loop (e corrigir o corpo do PR)"
type: issue
milestone: "Fase 12 — Experiência de criação de fluxos"
labels: [tipo:feature, area:editor, bug]
depends_on: [UX-12]
---

## Contexto

Atende RF-EDT-14, RF-EDT-03 e RF-EDT-11 (épico #185). Com a estrutura de #{UX-05} e o `DataPicker` de #{UX-07}, faltam
os ajustes de conteúdo dos demais nós e dos grupos. Na análise apareceu também um **bug no fluxo padrão**: o nó
"Abrir PR" tem `bodyFrom: "summary"`, mas a entrada ligada se chama `body` (`reviewer.summary → open_pr.body`), e
`summaryFromInputs` em `src/server/runtime/executors/git_executor.ts` não encontra o texto. O corpo do PR nunca vem
do Reviewer. Depois de #{UX-06}, o valor migrado é `inputs.summary`, que continua errado.

## Objetivo

Cada nó restante e os grupos têm opções explicadas e ações de ajuda (a prévia da Fonte, o link do Gatilho, a prévia da
Aprovação). O `bodyFrom` do Git é escolhido no `DataPicker` e validado, e o template e o fluxo padrão passam a montar o
corpo do PR a partir do Reviewer.

## Escopo

**Inclui:** Fonte com "Ver o que seria buscado agora"; Gatilho com cartões e link; Aprovação com prévia; Git com
cartões e `DataPicker` em `bodyFrom`; Saída com cartões; Map e Loop com o inspector novo (o `until` usa o editor de
#{UX-09}) e o diagrama da porta `exhausted`; a regra de validação `git_body_source_missing`; correção dos templates.
**Não inclui:** a validação que ensina para todas as regras (#{UX-14}).

## Especificação técnica

### Arquivos

Criar:

- `src/server/flows/source_preview.ts` (`previewSourceItems(projectId, sourceConfig)`; reutiliza
  `src/server/runtime/executors/select_source_items.ts` e o provider do GitHub; **não** cria run nem grava itens)
- `src/server/flows/source_preview.test.ts`
- `src/web/canvas/inspector/source_preview_dialog.tsx`
- `src/web/canvas/inspector/gate_preview.tsx`
- `src/web/canvas/inspector/loop_exhausted_diagram.tsx` (SVG inline pequeno: volta → teto → saída "Esgotou")
- `src/engine/validation_rules/git_rules.ts` (registrado em `validation_issues.ts`)

Alterar:

- `src/server/flows/flows_routes.ts` (`POST /api/projects/:projectId/flows/:flowId/source-preview`, com body
  `{ config: SourceConfig }`, que devolve `{ items: { number?, title, labels, blockedBy?: number[] }[]; skipped: number }`)
- `src/shared/api_types.ts` (tipos da rota)
- `src/web/canvas/inspector/source_inspector.tsx`, `trigger_inspector.tsx`, `gate_inspector.tsx`, `git_inspector.tsx`,
  `output_inspector.tsx`, `loop_fields.tsx` e o inspector de grupo
- `src/server/flows/templates/basic_factory.ts` (e os demais templates com `bodyFrom`): `bodyFrom: "inputs.body"`
- `src/server/flows/templates/flow_templates.test.ts`

### Regras e comportamento

- **Fonte:** o botão "Ver o que seria buscado agora" abre um diálogo com a lista (número, título, labels) e a contagem
  dos pulados por bloqueio ("3 issues puladas porque dependem de issues abertas"). Erro do GitHub aparece no diálogo
  com "Verifique a credencial do GitHub em Configurações". `skipBlocked` ganha o exemplo "#12 com ‘depends on #10’ só
  entra quando #10 fechar".
- **Gatilho:** cartões para os 5 `TRIGGER_KINDS` e o link "Configurar em Gatilhos" para `/projects/:id/triggers`,
  filtrado por este fluxo (se a tela aceitar o filtro por query string; senão, só o link).
- **Aprovação:** `show` vira checkboxes descritos; `gate_preview` mostra um esqueleto de como a tela Aprovações vai
  aparecer, com mensagem e seções.
- **Git:** cartões de ação (_Rebase_ avisa que conflitos são resolvidos por um agente); `bodyFrom` vira `DataPicker`
  (`scope: "node"`, mostrando primeiro os campos de texto).
- **`git_body_source_missing`** (aviso): `bodyFrom` começa com `inputs.` e a porta não existe ou não tem aresta, ou começa
  com `nodes.` e o nó não vem antes. A mensagem: "O corpo do PR aponta para ‘<path>’, que não existe aqui. Escolha o
  texto no seletor."
- **Saída:** cartões _Concluído / Precisa de humano / Não mover_ e uma explicação do comentário e do motivo
  (`notes`/`reason`/`failureSummary`).
- **Map:** `concurrency` com a explicação "quantos itens ao mesmo tempo" e o exemplo; `barrier` e `failFast` como
  switches descritos.
- **Loop:** `until` com o editor de #{UX-09} e o `DataPicker` `loopUntil`; `carry` com labels amigáveis; diagrama da
  porta `exhausted` com a dica "ligue a uma Saída ‘Precisa de humano’".

### Notas de design

- Cartões e ajuda seguem #{UX-05}. O diálogo da Fonte mostra estado de carregamento (skeleton de 3 linhas), vazio
  ("Nenhuma issue aberta com a label X") e erro.

## Critérios de aceite

- [ ] No fluxo padrão, abrir "Abrir PR" mostra o aviso `git_body_source_missing`; escolher `Texto do PR` no seletor grava
      `inputs.body` e o aviso some.
- [ ] Um PR aberto pelo template `basic_factory` com o `FakeAgentRuntime` tem como corpo o resumo do Reviewer.
- [ ] A prévia da Fonte lista as issues do GitHub fake, conta as puladas e não cria run nem item.
- [ ] Os cartões de Gatilho, Git e Saída têm descrição e ajuda `ⓘ`.
- [ ] O inspector do Loop mostra o diagrama de `exhausted` e o `until` com operadores tipados.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `source_preview.test.ts`: GitHub fake com issues bloqueadas e livres; erro do provider.
- Teste da rota em `flows_routes.test.ts`.
- Testes de `git_rules`: os três casos.
- `git_executor.test.ts`: `bodyFrom: "inputs.body"`.
- `other_inspectors.test.tsx`: Fonte (diálogo), Gatilho (link), Aprovação, Git (seletor), Saída e Loop.
