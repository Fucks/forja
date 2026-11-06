---
key: TRG-04
title: "Tela de gatilhos e pausa global"
type: issue
milestone: "Fase 9 — Gatilhos e schedules"
labels: [tipo:feature, area:gatilhos]
depends_on: [TRG-03, BRD-05]
---

## Contexto

Atende RF-TRG-01 e RF-TRG-03. Com o backend de #{TRG-01}…#{TRG-03}, o usuário precisa criar e acompanhar gatilhos sem
editar JSON: escolher o fluxo, o tipo (manual, horário, evento, webhook, coluna do board), a política e ver o próximo
disparo e o histórico. Um botão global pausa todos os gatilhos automáticos (útil antes de mexer no repositório).

## Objetivo

Em `/projects/:projectId/triggers` o usuário lista, cria, edita, habilita/desabilita, dispara manualmente e remove
gatilhos, vê próximo disparo e histórico, e pausa/retoma todos os gatilhos.

## Escopo

**Inclui:** página, formulário por tipo, construtor simples de cron (presets + campo livre), exibição única do token de webhook com exemplo de `curl`, histórico, pausa global também na topbar.
**Não inclui:** gatilhos entre projetos.

## Especificação técnica

### Arquivos

Criar:

- `src/web/app/triggers/use_triggers.ts`
- `src/web/app/triggers/trigger_form.tsx`
- `src/web/app/triggers/cron_presets.ts`
- `src/web/app/triggers/trigger_history.tsx`
- `src/web/app/triggers/webhook_token_dialog.tsx`
- `src/web/app/triggers/triggers_page.test.tsx`
  Alterar:
- `src/web/app/triggers/triggers_page.tsx` (substituir o placeholder)
- `src/web/app/topbar.tsx` (indicador "gatilhos pausados" com botão de retomar)

### Contratos

`CRON_PRESETS`: "Todo dia às 22:00" `0 22 * * *`, "Dias úteis às 08:00" `0 8 * * 1-5`, "A cada hora" `0 * * * *`,
"A cada 30 minutos" `*/30 * * * *`, "Personalizado".
Eventos no formulário: "Quando o limite de uso resetar", "Quando uma run terminar" (com fluxo e estado), "Quando um item for criado".
Coluna do board: Select com as colunas de `deriveColumns` (#{BRD-05}) do fluxo escolhido.

### Passo a passo

1. Hooks de query/mutation.
2. Lista: nome, fluxo, tipo com ícone (`Hand`, `Clock`, `Zap`, `Webhook`, `KanbanSquare`), política, próximo disparo (`describeCron` + data), último disparo e resultado, Switch habilitado, ações (disparar agora, editar, histórico, remover).
3. Formulário com campos por tipo e política ("Se já houver uma run: pular / enfileirar / rodar em paralelo").
4. Diálogo do token do webhook com exemplo `curl -X POST http://127.0.0.1:4317/api/hooks/<id> -H "X-Forja-Token: <token>"` e aviso "não será mostrado de novo".
5. Pausa global na página e na topbar.

## Critérios de aceite

- [ ] Criar gatilho "Todo dia às 22:00" mostra o próximo disparo correto.
- [ ] Criar webhook mostra o token uma única vez com o exemplo de `curl`.
- [ ] "Disparar agora" inicia a run e o histórico mostra o resultado.
- [ ] Pausar todos mostra o indicador na topbar e os disparos automáticos viram "pulado".
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `triggers_page.test.tsx` (API mockada): criar cron, criar webhook, disparar, pausar.
