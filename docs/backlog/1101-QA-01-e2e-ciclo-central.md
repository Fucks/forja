---
key: QA-01
title: "E2E do ciclo central com Playwright"
type: issue
milestone: "Fase 11 — Qualidade e lançamento"
labels: [tipo:qualidade, area:fundacao]
depends_on: [OBS-06, BRD-07, EDT-11, GIT-04, F-08]
---

## Contexto

O ciclo central da Forja precisa de uma prova automatizada no navegador: cadastrar projeto → criar fluxo pelo template →
agrupar/ajustar no canvas → publicar → executar → ver ao vivo → abrir logs → ver no board. O modo demo (#{OBS-06}) permite
rodar tudo sem Docker e sem credenciais.

## Objetivo

`npm run test:e2e` sobe a Forja em modo fake num diretório temporário e executa os cenários do ciclo central no Chromium.

## Escopo

**Inclui:** Playwright, config com `webServer`, fixtures de repositório git temporário, 4 cenários, job opcional no CI (ubuntu).
**Não inclui:** testes visuais por screenshot.

## Especificação técnica

### Arquivos

Criar:

- `playwright.config.ts`
- `e2e/fixtures.ts`
- `e2e/project_and_flow.spec.ts`
- `e2e/live_run.spec.ts`
- `e2e/board.spec.ts`
- `e2e/approvals.spec.ts`
  Alterar:
- `package.json` (script `test:e2e`)
- `.github/workflows/ci.yml` (job `e2e` em ubuntu, `needs: checks`)

### Contratos

`webServer`: `FORJA_DATA_DIR=<tmp> FORJA_AGENT_RUNTIME=fake FORJA_PORT=4399 node dist/cli.js --no-open` após `npm run build`.
`e2e/fixtures.ts` cria um repositório git temporário com um commit e o expõe aos testes.

Cenários:

1. **project_and_flow**: cadastrar o repo temporário, criar fluxo pela "Fábrica básica", abrir o inspector do Dev, mudar o effort para `max`, mudar a concorrência do map para 2, publicar (v1).
2. **live_run**: criar 3 itens locais, iniciar run, ver o nó Dev com estado "Rodando" e o grupo com contadores, abrir o drawer, ver logs chegando, esperar "Sucesso".
3. **board**: ver os cards andando de coluna e terminando em "Concluído"; arrastar um item novo para a coluna-gatilho e ver a run iniciar.
4. **approvals**: fluxo com gate, aprovar com comentário e ver o fluxo seguir.

### Passo a passo

1. Configuração e fixtures.
2. Cenários com seletores por papel/rótulo (`getByRole`, `getByLabel`) — nada de seletores CSS frágeis.
3. Job no CI.

## Critérios de aceite

- [ ] `npm run test:e2e` passa localmente sem Docker nem credenciais.
- [ ] Os quatro cenários cobrem os passos descritos.
- [ ] O job `e2e` roda no CI e publica o relatório do Playwright como artefato em falha.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

Os próprios cenários E2E.
