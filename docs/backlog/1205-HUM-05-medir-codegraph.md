---
key: HUM-05
title: "Medir a economia de tokens com CodeGraph"
type: human
milestone: "Fase 11 — Qualidade e lançamento"
labels: [tipo:qualidade, area:uso-custo]
depends_on: []
---

## Contexto

Economizar tokens com ferramentas como o CodeGraph é um objetivo explícito do produto. Antes de recomendar o preset
"CodeGraph" como padrão nos templates, vale medir com dados reais usando o próprio painel de uso da Forja (#{OBS-05}).

## O que fazer

1. Escolher 3 issues parecidas de um repositório real.
2. Rodar a "Fábrica básica" duas vezes por issue: com o perfil `tlp_builtin_codegraph` e com `tlp_builtin_default`.
3. Comparar no painel de uso: tokens de entrada, saída, custo e duração por nó; e a qualidade do PR (aprovado sem mudanças?).
4. Registrar o resultado no `docs/pesquisa/benchmark.md` (nova seção "Medição: CodeGraph").

## Resultado esperado

Tabela com a economia medida e a decisão sobre o perfil padrão dos templates.
