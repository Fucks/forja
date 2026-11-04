---
key: F-08
title: "CI no GitHub Actions (Ubuntu e Windows)"
type: issue
milestone: "Fase 0 — Fundação"
labels: [tipo:infra, area:fundacao]
depends_on: [F-02]
---

## Contexto
Windows é plataforma de primeira classe (RNF-POR-01): o autor usa Windows e concorrentes falham aí. O CI roda as
mesmas verificações do sandbox nas duas plataformas, em todo PR para `development` e `main`.

## Objetivo
Existe um workflow que roda `typecheck`, `lint` e `test` em `ubuntu-latest` e `windows-latest` com Node 22.

## Escopo
**Inclui:** `.github/workflows/ci.yml`, cache do npm, matriz de SO, `.gitattributes`.
**Não inclui:** E2E (#{QA-01}) e testes de integração (precisam de Docker e `claude`).

## Especificação técnica
### Arquivos
Criar:
- `.github/workflows/ci.yml`
- `.gitattributes`

### Contratos
- Gatilhos: `pull_request` para `development` e `main`; `push` em `development`.
- Job `checks`, matriz `os: [ubuntu-latest, windows-latest]`: `actions/checkout@v4`, `actions/setup-node@v4`
  (`node-version: 22`, `cache: npm`), `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test`.
- `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`.
- `.gitattributes`: `* text=auto eol=lf`.

### Passo a passo
1. Escreva o workflow e o `.gitattributes`.
2. Confirme localmente que `npm ci` funciona com o `package-lock.json` versionado.

## Critérios de aceite
- [ ] O PR desta issue mostra os jobs Ubuntu e Windows verdes.
- [ ] O workflow usa exatamente os scripts `typecheck`, `lint` e `test`.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
O próprio workflow.
