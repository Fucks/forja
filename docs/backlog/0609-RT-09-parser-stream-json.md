---
key: RT-09
title: "Parser do stream-json do Claude Code"
type: issue
milestone: "Fase 6 — Runtime de agentes"
labels: [tipo:feature, area:harness]
depends_on: [ENG-01]
---

## Contexto

Com runtime próprio (#{RT-01}), a Forja conversa diretamente com o `claude -p --output-format stream-json --verbose`. A saída é
NDJSON com eventos `system` (subtype `init`, `api_retry`), `assistant`, `user` (resultados de ferramenta), `stream_event`
(com `--include-partial-messages`) e um `result` final com `subtype` (`success`, `error_max_turns`, `error_during_execution`,
`error_max_budget_usd`, `error_max_structured_output_retries`), `is_error`, `result`, `structured_output`, `usage`,
`modelUsage`, `total_cost_usd`, `num_turns`, `session_id`, `duration_ms`, `permission_denials` (documentação oficial,
code.claude.com/docs/en/headless e cli-reference, consultadas em 2026-11-03). Um parser puro e tolerante transforma isso nos
`AgentEvent`s da Forja e no resultado final — é a peça que mais muda entre versões do CLI, por isso fica isolada.

## Objetivo

Existe `createStreamJsonParser()` que recebe linhas (inclusive quebradas e linhas não JSON), emite `AgentEvent`s normalizados e
devolve o `ClaudeResult` final, testado com fixtures.

## Escopo

**Inclui:** parsing incremental por linha, mapeamento de `assistant` (texto e `tool_use`), `user` (`tool_result` resumido),
`system/init` (modelo, ferramentas, status dos MCPs), `system/api_retry`, `result`; tolerância a campos desconhecidos;
fixtures sintéticas baseadas na documentação.
**Não inclui:** iniciar o processo (#{RT-02}), parser de limite de uso (#{RT-04}).

## Especificação técnica

### Arquivos

Criar:

- `src/integrations/agent_runtime/stream_json_parser.ts`
- `src/integrations/agent_runtime/stream_json_parser.test.ts`
- `src/test/fixtures/stream_json/success_simple.ndjson`
- `src/test/fixtures/stream_json/tool_calls.ndjson`
- `src/test/fixtures/stream_json/structured_output.ndjson`
- `src/test/fixtures/stream_json/error_max_turns.ndjson`
- `src/test/fixtures/stream_json/mcp_failed.ndjson`

### Contratos

```ts
export interface ClaudeResult {
    subtype:
        | "success"
        | "error_max_turns"
        | "error_during_execution"
        | "error_max_budget_usd"
        | "error_max_structured_output_retries"
        | string;
    isError: boolean;
    text?: string;
    structuredOutput?: unknown;
    usage: TokenUsage; // soma de modelUsage quando presente (inclui subagentes); senão usage
    costUsd?: number;
    numTurns?: number;
    sessionId?: string;
    durationMs?: number;
    permissionDenials: { toolName: string; reason?: string }[];
    errors: string[];
}
export interface InitInfo {
    model?: string;
    tools: string[];
    mcpServers: { name: string; status: string }[];
}
export interface StreamJsonParser {
    push(line: string): AgentEvent[]; // uma linha do stdout; linha inválida vira AgentEvent "raw"
    init(): InitInfo | undefined;
    result(): ClaudeResult | undefined; // presente depois da linha "result"
    lastAssistantText(): string; // último bloco de texto (para summary quando não há result.text)
}
export function createStreamJsonParser(opts: { now(): Date; iteration: number }): StreamJsonParser;
```

Mapeamento para `AgentEvent` (#{ENG-01}): texto do `assistant` → `text`; cada `tool_use` → `tool_call` com `name` e `args`
(JSON compacto, truncado em 4 KB); `tool_result` → `raw` com `[resultado de <ferramenta>] <primeiros 500 chars>`; `system/init` →
`system` "modelo X · N ferramentas · MCP: codegraph (connected)"; MCP com status ≠ connected → `system` com aviso;
`api_retry` → `system` "nova tentativa da API (n/m): <erro>"; linha não JSON → `raw`.

### Passo a passo

1. Fixtures sintéticas seguindo a documentação (marque no topo de cada arquivo, numa linha `{"_fixture":"sintética"}` que o parser ignora).
2. Parser incremental e testes.
3. Quando #{HUM-02} gravar fixtures reais, elas entram na mesma suíte.

## Critérios de aceite

- [ ] As cinco fixtures produzem os eventos e o `ClaudeResult` esperados.
- [ ] `structured_output` do `result` aparece em `structuredOutput`.
- [ ] `usage` usa `modelUsage` somado quando presente.
- [ ] Linha truncada ou não JSON não lança: vira `raw`.
- [ ] Campos desconhecidos são ignorados sem erro.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `stream_json_parser.test.ts` com as fixtures e casos de borda.
