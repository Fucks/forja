---
key: HUM-01
title: "Definir nome do pacote npm e checar a marca Forja"
type: human
milestone: "Fase 11 — Qualidade e lançamento"
labels: [tipo:infra, area:distribuicao]
depends_on: []
---

## Contexto

O nome `forja` no npm está retido pelo próprio npm (pacote removido) e há repositórios homônimos no GitHub (ex.:
`nandomoreirame/forja`, cliente GUI para "vibe coders"). Para publicar, precisamos de um nome com escopo e de uma
checagem mínima de marca. A issue de empacotamento usa `@fucks/forja` como provisório.

## O que fazer

1. Decidir o nome publicado (ex.: `@fucks/forja`, `@forja-dev/cli`, `forja-factory`) e confirmar disponibilidade com `npm view <nome>`.
2. Criar a organização/escopo no npm se necessário e um `NPM_TOKEN` de automação; salvar como segredo do repositório.
3. Fazer uma busca rápida de marca registrada para "Forja" na classe de software (INPI) e anotar o resultado.
4. Atualizar a seção "Nome e posicionamento" do PRD com a decisão.

## Resultado esperado

Nome do pacote decidido e registrado no PRD; segredo `NPM_TOKEN` configurado no GitHub; nota sobre a marca.
