---
key: HUM-03
title: "Validar MCP e permissões por run no Sandcastle"
type: human
milestone: "Fase 6 — Runtime Sandcastle"
labels: [tipo:qualidade, area:ferramentas]
depends_on: []
---

## Contexto
A Forja aplica perfis de ferramentas escrevendo `.mcp.json` e `.claude/settings.local.json` no worktree do item (#{RT-07}),
porque o Sandcastle 0.12 não repassa `--mcp-config`/`--allowedTools` por run. É preciso confirmar com o CLI real que o
Claude Code dentro do container carrega esses arquivos sem diálogo de confiança e respeita `allow`/`deny`, e que prompts com
`{{` literal (escapado) não são reprocessados pelo Sandcastle.

## O que fazer
1. Construir a imagem do agente e abrir um sandbox com `createSandbox` num repositório de teste.
2. Escrever `.mcp.json` com o servidor `codegraph` e `.claude/settings.local.json` negando `Write`; rodar um agente que tente listar as ferramentas MCP e escrever um arquivo.
3. Verificar nos eventos: MCP `codegraph` conectado; escrita negada.
4. Rodar um prompt contendo `\{{x}}` renderizado pela Forja como `{{x}}` e ver se o Sandcastle tenta substituir.
5. Registrar o resultado no PRD ("Premissas e decisões em aberto") e, se algo não funcionar, abrir issue de agente com a alternativa (ex.: `claude mcp add` no setup do sandbox, ou PR no Sandcastle para expor flags).

## Resultado esperado
Estratégia de ferramentas por nó confirmada (ou issue de correção criada) e anotada no PRD.
