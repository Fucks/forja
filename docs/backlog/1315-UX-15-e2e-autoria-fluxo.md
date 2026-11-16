---
key: UX-15
title: "E2E: montar um fluxo com Decisão, Comando e Loop só pela interface"
type: issue
milestone: "Fase 12 — Experiência de criação de fluxos"
labels: [tipo:qualidade, area:editor]
depends_on: [UX-14]
---

## Contexto

Fecha o épico #185. O E2E atual (`e2e/project_and_flow.spec.ts`, de QA-01) cobre o ciclo central, mas não a jornada de
um leigo montando um fluxo do zero com as peças novas (#{UX-03} a #{UX-14}). Este teste protege a experiência contra
regressões.

## Objetivo

Um teste Playwright monta, só pela interface (paleta, menu a partir da porta, `DataPicker`, cartões e presets), o fluxo
"Reviewer reprova → volta ao Dev; aprova → testes → PR", publica, roda com o runtime fake e verifica os dois caminhos.

## Escopo

**Inclui:** `e2e/flow_authoring.spec.ts`; helpers de página para paleta, inspector e `DataPicker`.
**Não inclui:** teste com o Claude real (tarefa humana #{UX-16}).

## Especificação técnica

### Arquivos

Criar:

- `e2e/flow_authoring.spec.ts`
- `e2e/pages/flow_editor_page.ts` (page object: `addFromPalette(title)`, `connect(from, to)`,
  `dropEdgeOnEmpty(fromPort)`, `openInspector(label)`, `pickData(label)`, `chooseOption(title)`, `applyPreset(label)`)

Alterar:

- `e2e/fixtures.ts`, se preciso (projeto com o GitHub fake e o runtime roteirizado: Reviewer reprova na 1ª volta e
  aprova na 2ª; `npm test` sai 0)

### Roteiro

1. Criar um fluxo vazio, ver o `EmptyCanvas` e escolher "Começar do zero".
2. Pela paleta, adicionar Fonte, Map, Loop, Agente "Dev", Agente "Reviewer" (preset de formato "Aprovação"), Comando
   (preset "Rodar testes"), Git (Abrir PR) e duas Saídas.
3. Ligar as portas, uma delas pelo menu "adicionar a partir da porta".
4. No Loop, `until` = `Reviewer › approved` "é verdadeiro", escolhido no `DataPicker`.
5. No Git, `bodyFrom` = `Texto do PR`.
6. Painel de problemas vazio → publicar → executar com 1 item.
7. Verificar: o Dev roda 2 vezes, o Comando termina com sucesso, o PR é aberto (artefato `pr_url`) e o item fica
   "Concluído".
8. Variação: o runtime faz o Reviewer reprovar sempre → o item sai por `exhausted` → "Precisa de humano".

## Critérios de aceite

- [ ] O teste passa localmente e no CI com o runtime fake, sem rede.
- [ ] O teste não usa seletores frágeis: só `getByRole`/`getByLabel` com os nomes amigáveis do catálogo.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam, e o E2E roda com o script já usado por QA-01.

## Testes

- `e2e/flow_authoring.spec.ts`: os dois cenários acima.
