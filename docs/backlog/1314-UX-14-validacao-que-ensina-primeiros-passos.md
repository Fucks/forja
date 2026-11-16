---
key: UX-14
title: "Validação que ensina e primeiros passos no editor (canvas vazio, tour, template Revisão com volta)"
type: issue
milestone: "Fase 12 — Experiência de criação de fluxos"
labels: [tipo:feature, area:editor]
depends_on: [UX-13, UX-03]
---

## Contexto

Atende RF-EDT-14 e RF-EDT-05 (épico #185). As mensagens de `ValidationIssue` (`src/shared/validation_issue.ts`,
`src/engine/validation_rules/*`) dizem *o que* está errado, mas não *como corrigir*, e clicar nelas não leva ao campo.
Quem abre o editor com o canvas vazio não tem ponto de partida. O template de loop de revisão existe
(`src/server/flows/templates/review_loop.ts`), mas não é o exemplo didático da Decisão + Comando + Loop que o épico
propõe.

## Objetivo

Toda regra de validação tem mensagem em linguagem leiga e `fix`, e clicar num problema foca o nó e o campo. O canvas
vazio oferece templates ou "começar do zero", um tour opcional de 5 passos apresenta o editor, e o template "Revisão
com volta" demonstra Decisão, Comando e Loop.

## Escopo

**Inclui:** `fix` e `fieldKey` no `ValidationIssue`; revisão de **todas** as mensagens; foco no campo; estado de canvas
vazio; tour; template.
**Não inclui:** o E2E de autoria (#{UX-15}).

## Especificação técnica

### Arquivos

Criar:

- `src/web/canvas/empty_canvas.tsx`
- `src/web/canvas/editor_tour.tsx` (5 passos: paleta → nó → porta → inspector → publicar; overlay acessível; "Pular" e
  "Não mostrar de novo" guardados em `localStorage`, com try/catch)
- `src/web/canvas/editor_tour.test.tsx`
- `src/web/canvas/inspector/use_focus_field.ts` (o inspector registra `fieldKey → ref`; um problema com `fieldKey` foca o
  campo)

Alterar:

- `src/shared/validation_issue.ts` (`fix?: string`, `fieldKey?: string`; o schema Zod também)
- `src/engine/validation_rules/agent_rules.ts`, `group_rules.ts`, `identity_rules.ts`, `loop_rules.ts`,
  `port_rules.ts`, `git_rules.ts` e a regra da Decisão (mensagens revisadas, mais `fix` e `fieldKey`)
- `src/web/app/flows/use_editor_issues.ts` e `src/web/canvas/problems_panel.tsx` (mostram "Como corrigir:" e clicar
  seleciona o nó e foca o campo)
- `src/web/canvas/flow_canvas.tsx` (sem nós, mostra `EmptyCanvas`)
- `src/server/flows/templates/review_loop.ts` (vira "Revisão com volta": Fonte → Map[ Loop[ Dev → Reviewer (formato
  approved/notes) ] until `nodes.reviewer.result.approved` é verdadeiro ] → Comando `npm test` (falha se ≠ 0) → Git
  abrir PR (`bodyFrom: inputs.body`) → Saída; `exhausted` → Saída "Precisa de humano")
- `src/server/flows/templates/flow_templates.test.ts`
- `src/web/docs/concepts.ts` (exemplo guiado apontando para esse template)
- os testes das regras de validação

### Guia de redação das mensagens

- Diga o que está errado em uma frase, sem nome técnico: "O Agente ‘Dev’ não tem prompt", e não "agent.prompt vazio".
- `fix` começa com verbo no imperativo: "Escreva o que o agente deve fazer na aba Configurar › Prompt."
- O nome técnico pode aparecer entre parênteses no fim, para quem precisa: "(código: agent_prompt_empty)".

### Notas de design

- `EmptyCanvas`: cartão central com dois caminhos: "Começar de um template" (lista de `flow_template_registry` com
  descrição, criando o grafo no rascunho) e "Começar do zero", que adiciona um Gatilho e destaca a paleta com uma seta.
- Tour: popovers ancorados, foco preso no popover, Esc pula, e o indicador "2 de 5".
- Painel de problemas: ícone de nível (erro/aviso) e texto, nunca só cor.

## Critérios de aceite

- [ ] Toda regra registrada em `validation_issues.ts` produz `fix` (teste que itera as regras com grafos inválidos de
      exemplo).
- [ ] Clicar em "O Agente ‘Dev’ não tem prompt" seleciona o Dev, abre a aba Configurar e foca o prompt.
- [ ] Um fluxo novo e vazio mostra `EmptyCanvas`; escolher um template preenche o rascunho.
- [ ] O tour aparece na primeira abertura, pode ser pulado e não volta depois de "Não mostrar de novo".
- [ ] O template "Revisão com volta" é válido, roda com o `FakeAgentRuntime` e cai em "Precisa de humano" quando o
      Reviewer reprova em todas as voltas.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- Testes das regras: `fix` e `fieldKey` presentes.
- `problems_panel` e `use_focus_field`: clique foca o campo.
- `editor_tour.test.tsx`: passos, pular, lembrar (com `localStorage` lançando erro).
- `flow_templates.test.ts`: o template novo valida e roda nos dois caminhos.
