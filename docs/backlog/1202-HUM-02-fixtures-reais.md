---
key: HUM-02
title: "Gravar fixtures reais do stream-json do Claude Code e de limite de uso"
type: human
milestone: "Fase 6 — Runtime de agentes"
labels: [tipo:qualidade, area:harness]
depends_on: []
---

## Contexto
O parser de stream-json (#{RT-09}) e o de limite de uso (#{RT-04}) começam com fixtures sintéticas escritas a partir da
documentação. Saídas reais do `claude -p --output-format stream-json --verbose` tornam esses testes fiéis. O sandbox do pipeline não
tem credenciais, então isso precisa ser feito na máquina do autor.

## O que fazer
1. Na imagem do agente (ou no host), rodar `claude -p --output-format stream-json --verbose --model claude-haiku-5-5` com o prompt via
   stdin e salvar o stdout em arquivo para quatro casos: resposta simples; uso de ferramentas (Read/Bash/Grep); `--json-schema` com
   um schema pequeno; `--max-turns 1` numa tarefa que precisa de mais turnos (gera `error_max_turns`). Um quinto com `--mcp-config`
   apontando para um MCP inexistente (status de falha no `init`).
2. Copiar as mensagens de erro de limite que já apareceram em `auto-development/.sandcastle/logs/` (procure por "limit") — anonimize o que for pessoal.
3. Salvar em `src/test/fixtures/stream_json/real_*.ndjson` e `src/test/fixtures/usage_limit_messages_real.txt`, anotar a versão do CLI (`claude --version`) no topo e abrir um PR.

## Resultado esperado
Fixtures reais commitadas e usadas pelos testes de #{RT-09} e #{RT-04}; versão do CLI registrada no PRD.
