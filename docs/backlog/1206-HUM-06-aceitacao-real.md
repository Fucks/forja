---
key: HUM-06
title: "Teste de aceitação com 3 issues reais"
type: human
milestone: "Fase 11 — Qualidade e lançamento"
labels: [tipo:qualidade, area:fundacao]
depends_on: []
---

## Contexto
O E2E (#{QA-01}) usa o runtime fake. Antes de considerar o MVP pronto, a Forja precisa rodar a linha de montagem de verdade:
Docker, Claude Code e GitHub, com o cenário exato que motivou o produto — um TL especificando, três Devs em paralelo e um
Reviewer por vez.

## O que fazer
1. Num repositório real (pode ser o próprio `forja` ou o `auto-development`), criar 3 issues pequenas com a label `Sandcastle`, uma bloqueada por outra.
2. Criar o fluxo pela "Fábrica básica" e pelo "Pipeline Sandcastle"; publicar.
3. Rodar e acompanhar: canvas ao vivo, logs, board, custo.
4. Forçar um limite de uso (ou simular com uma conta no limite) e verificar a pausa e a retomada.
5. Reiniciar o servidor no meio de uma run e verificar a recuperação.
6. Registrar problemas como issues novas com a label `Sandcastle`.

## Resultado esperado
PRs abertos pelas runs, nenhum item perdido após reinício e lista de problemas transformada em issues.
