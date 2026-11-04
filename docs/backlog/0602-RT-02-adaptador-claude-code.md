---
key: RT-02
title: "Adaptador Claude Code: executar nó agente no container"
type: issue
milestone: "Fase 6 — Runtime de agentes"
labels: [tipo:feature, area:harness]
depends_on: [RT-01, RT-04, RT-09]
---

## Contexto
Atende RF-EDT-04 (modelo e effort por nó executados de verdade), RF-OBS-03 (eventos ao vivo) e RF-RUN-04. Com o workspace de
#{RT-01} e o parser de #{RT-09}, esta issue roda o agente: `docker exec` de `claude -p` dentro do container do item, com o
prompt por stdin e as flags montadas a partir da config do nó. Flags confirmadas na documentação oficial (2026-11-03):
`--output-format stream-json --verbose`, `--model`, `--effort low|medium|high|xhigh|max`, `--max-turns`, `--max-budget-usd`,
`--json-schema` (resultado em `structured_output`), `--permission-mode`, `--allowedTools`/`--disallowedTools`,
`--mcp-config`/`--strict-mcp-config`, `--append-system-prompt`, `--resume`, `--no-session-persistence`.

Além do `claude -p` único, o adaptador implementa **iterações** (o padrão "Ralph" do pipeline atual: o implementer roda até 100
vezes no mesmo workspace, cada vez em contexto limpo, até emitir um sinal de conclusão) e **comandos de contexto** no prompt
(`` !`git log --oneline -5` `` é executado no workspace e substituído pela saída — os prompts do pipeline atual usam isso).

## Objetivo
`Workspace.runAgent` e `AgentRuntime.runHeadless` executam o Claude Code no container com as opções do nó, entregam os eventos
em tempo real, devolvem saída estruturada validada, commits, uso somado e `sessionId`, e lançam os erros tipados de #{ENG-01}.

## Escopo
**Inclui:** montagem do comando, prompt por stdin, iterações com sinal de conclusão, comandos de contexto, timeout total e por
inatividade, saída estruturada via `--json-schema` + validação local, commits do workspace (antes/depois), mapeamento de erros.
**Não inclui:** arquivo de MCP e regras de ferramentas (#{RT-07} fornece os caminhos/flags), env de credenciais (#{RT-08}),
gravação de logs (#{RT-03}).

## Especificação técnica
### Arquivos
Criar:
- `src/integrations/agent_runtime/claude_command.ts`
- `src/integrations/agent_runtime/run_agent_in_container.ts`
- `src/integrations/agent_runtime/prompt_commands.ts`
- `src/integrations/agent_runtime/output_schema.ts`
- `src/integrations/agent_runtime/claude_command.test.ts`
- `src/integrations/agent_runtime/run_agent_in_container.test.ts`
- `src/integrations/agent_runtime/prompt_commands.test.ts`
- `src/integrations/agent_runtime/output_schema.test.ts`
Alterar:
- `src/integrations/agent_runtime/docker_agent_runtime.ts` (usar `runAgentInContainer`)
- `src/integrations/agent_runtime/agent_runtime.ts` (`AgentRunRequest` ganha `maxTurns?`, `maxBudgetUsd?`, `toolArgs: string[]`, `expandPromptCommands: boolean`)

### Contratos
```ts
export function buildClaudeArgs(request: AgentRunRequest, opts: { iteration: number; resumeSessionId?: string }): string[];
// ["claude", "-p", "--output-format", "stream-json", "--verbose", "--model", m, "--effort", e,
//  ...(maxTurns ? ["--max-turns", n] : []), ...(maxBudgetUsd ? ["--max-budget-usd", v] : []),
//  "--permission-mode", mode, ...(outputSchema ? ["--json-schema", JSON.stringify(schema)] : []),
//  ...request.toolArgs /* de #{RT-07} */, "--append-system-prompt", systemPrompt?]
// Nunca coloque segredos aqui; o prompt vai por stdin.
export type RunAgentInContainer = (ws: { containerId: string; exec: ContainerManager["exec"]; root: string; git: GitProvider },
    request: AgentRunRequest, hooks: AgentRunHooks) => Promise<AgentRunResult>;
export async function expandPromptCommands(prompt: string, run: (cmd: string) => Promise<{ exitCode: number; stdoutTail: string }>): Promise<string>;
// substitui cada ocorrência de !`cmd` (fora de blocos de código cercados) pela saída; falha vira "[comando falhou (exit N): …]"
export function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType; // object, properties, required, string, number, integer, boolean, array, enum
```

### Semântica
- **Uma iteração** = um `docker exec` do `claude` com o prompt (já renderizado pela Forja e com comandos de contexto expandidos
  quando `expandPromptCommands`) em stdin; cada linha do stdout vai para o parser (#{RT-09}) e os `AgentEvent`s para `hooks.onEvent`.
- **Iterações**: se `maxIterations > 1` e há `completionSignal`, repete enquanto o sinal não aparecer no texto do agente e houver
  iterações; cada repetição é contexto limpo com o prompt original + uma nota "Iteração N de M: continue a partir dos commits do branch".
  Sem `completionSignal`, `maxIterations` só repete se a iteração terminar sem commits novos e `subtype` de erro recuperável
  (`error_max_turns`). Uso e eventos somam todas as iterações.
- **Saída estruturada**: com `outputSchema`, a **última** iteração usa `--json-schema`; o resultado é validado de novo com
  `jsonSchemaToZod` (defesa contra mudanças do CLI); inválido ou ausente → `StructuredOutputError` com o texto bruto.
- **Timeouts**: total via `AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)])` → `AgentTimeoutError("total")`;
  inatividade: sem nenhuma linha por `idleTimeoutSeconds` → aborta → `AgentTimeoutError("idle")`.
- **Erros**: `result.isError` ou exit ≠ 0 → verifica `parseUsageLimit` (#{RT-04}) no texto do resultado, nos `errors` e na cauda do
  stderr → `UsageLimitError { resetAt }`; `error_max_budget_usd` → `AgentRuntimeError("orçamento do nó atingido")`; abort pelo
  usuário → `AgentCanceledError`; demais → `AgentRuntimeError` com a mensagem.
- **Commits**: `git rev-list <HEAD antes>..HEAD` no worktree pelo host após a última iteração.
- `summary` = `result.text` da última iteração (ou `lastAssistantText`), truncado em 4 000 chars; `sessionId` da última.
- `runHeadless` usa a mesma função no container efêmero.

### Passo a passo
1. `buildClaudeArgs`, `expandPromptCommands`, `output_schema.ts` puros com testes.
2. `runAgentInContainer` com `ContainerManager` falso que reproduz as fixtures de #{RT-09} linha a linha (com atrasos no FakeClock).
3. Integração no `DockerAgentRuntime`.

## Critérios de aceite
- [ ] Os argumentos contêm `--model`, `--effort` e `--permission-mode` do request; nenhum segredo e nenhum prompt em argv.
- [ ] Eventos chegam ao `onEvent` durante a execução, na ordem.
- [ ] Com `completionSignal` e `maxIterations: 3`, para na iteração em que o sinal aparece; uso soma as iterações.
- [ ] Saída que casa com o schema aparece em `output`; inválida lança `StructuredOutputError`.
- [ ] Mensagem "5-hour limit reached ∙ resets 3pm" no resultado vira `UsageLimitError` com `resetAt`.
- [ ] Sem saída por mais que `idleTimeoutSeconds` → `AgentTimeoutError("idle")`; estouro do total → `AgentTimeoutError("total")`.
- [ ] `` !`git log -1` `` no prompt é substituído pela saída do comando no workspace; dentro de bloco de código não.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `claude_command.test.ts`, `prompt_commands.test.ts`, `output_schema.test.ts`, `run_agent_in_container.test.ts` (fixtures + FakeClock).
