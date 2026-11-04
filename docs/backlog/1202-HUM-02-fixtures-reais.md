---
key: HUM-02
title: "Gravar fixtures reais de eventos do Sandcastle e de limite de uso"
type: human
milestone: "Fase 6 — Runtime Sandcastle"
labels: [tipo:qualidade, area:harness]
depends_on: []
---

## Contexto
Os testes do runtime usam fachadas falsas e mensagens sintéticas. Fixtures reais (o que o Sandcastle 0.12 entrega em
`onAgentStreamEvent` e as mensagens exatas de limite do Claude Code) tornam esses testes fiéis. O sandbox do pipeline não
tem credenciais, então isso precisa ser feito na máquina do autor.

## O que fazer
1. Num repositório de teste, rodar um script curto com `sandcastle.run({ agent: claudeCode("claude-haiku-5-5"), logging: { type: "file", path, onAgentStreamEvent: (e) => fs.appendFileSync("events.ndjson", JSON.stringify(e) + "\n") }, ... })` para três casos: sucesso simples, uso de ferramentas (Read/Bash) e saída estruturada com `Output.object`.
2. Copiar as mensagens de erro de limite que já apareceram nos logs do `auto-development/.sandcastle/logs/` (procure por "limit") — anonimize o que for pessoal.
3. Salvar em `src/test/fixtures/sandcastle_events/*.ndjson` e `src/test/fixtures/usage_limit_messages_real.txt` e abrir um PR.

## Resultado esperado
Fixtures commitadas; os testes de #{RT-02} e #{RT-04} passam a usá-las (issue de agente pode ser criada para isso, se necessário).
