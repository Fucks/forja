---
key: HUM-03
title: "Validar no container as flags de MCP, ferramentas, effort e saída estruturada"
type: human
milestone: "Fase 6 — Runtime de agentes"
labels: [tipo:qualidade, area:ferramentas]
depends_on: []
---

## Contexto
O runtime próprio (#{RT-01}, #{RT-02}, #{RT-07}) monta o comando do Claude Code com `--mcp-config <arquivo> --strict-mcp-config`,
`--allowedTools`/`--disallowedTools`, `--permission-mode`, `--effort` e `--json-schema`, com o worktree montado num container e o
`.git` comum montado no mesmo caminho. É preciso confirmar com o CLI real, dentro da imagem do agente, que tudo se comporta como a
documentação diz — inclusive no Windows com Docker Desktop.

## O que fazer
1. Construir a imagem do agente (#{RT-06}) e subir um container com um worktree de um repositório de teste montado como o runtime faz
   (worktree em `/home/agent/workspace`, `.git` comum no mesmo caminho absoluto). Rodar `git status` dentro dele.
2. Rodar `claude -p` com `--mcp-config` do CodeGraph e `--strict-mcp-config`: o `init` do stream-json mostra `codegraph` conectado e nenhum outro MCP.
3. Rodar com `--disallowedTools Write` pedindo para criar um arquivo: a escrita é negada (`permission_denials`).
4. Rodar com `--effort low` e `--effort max` e com `--json-schema`: o resultado tem `structured_output` válido.
5. Passar `CLAUDE_CODE_OAUTH_TOKEN` via `docker exec -e CLAUDE_CODE_OAUTH_TOKEN` (valor só no ambiente do host) e confirmar autenticação.
6. Registrar o resultado no PRD ("Premissas e decisões em aberto"); se algo divergir, abrir issue de agente com a correção.

## Resultado esperado
Flags e montagem confirmadas (ou issues de correção criadas) e anotadas no PRD com a versão do CLI.
