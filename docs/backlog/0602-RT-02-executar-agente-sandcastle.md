---
key: RT-02
title: "Executar nó agente no Sandcastle com effort, saída estruturada e eventos"
type: issue
milestone: "Fase 6 — Runtime Sandcastle"
labels: [tipo:feature, area:harness]
depends_on: [RT-01, RT-04]
---

## Contexto
Atende RF-EDT-04 (modelo e effort por nó executados de verdade), RF-OBS-03 (eventos ao vivo) e RF-RUN-04. Com o
workspace de #{RT-01}, falta rodar o agente: `sandbox.run({ agent: claudeCode(model, { effort, permissionMode }),
prompt, maxIterations, idleTimeoutSeconds, output: Output.object({ tag: "output", schema }), logging: { type: "file",
path, onAgentStreamEvent }, signal })`. O parser de limite de uso (#{RT-04}) transforma a mensagem de erro em
`UsageLimitError` com `resetAt`.

## Objetivo
`Workspace.runAgent` e `AgentRuntime.runHeadless` executam o agente pelo Sandcastle, entregam os eventos normalizados em
tempo real, devolvem saída validada, commits, uso de tokens e `sessionId`, e lançam os erros tipados de #{ENG-01}.

## Escopo
**Inclui:** montagem das opções do Sandcastle, conversão de JSON Schema → validador Standard Schema (Zod), mapeamento de
eventos, soma de uso por iteração, instrução de saída anexada ao prompt, timeout total, mapeamento de erros.
**Não inclui:** gravação em arquivo dos eventos da Forja (#{RT-03}), preço (#{RT-05}).

## Especificação técnica
### Arquivos
Criar:
- `src/integrations/agent_runtime/run_agent_node.ts`
- `src/integrations/agent_runtime/agent_event_mapper.ts`
- `src/integrations/agent_runtime/output_schema.ts`
- `src/integrations/agent_runtime/run_agent_node.test.ts`
- `src/integrations/agent_runtime/agent_event_mapper.test.ts`
- `src/integrations/agent_runtime/output_schema.test.ts`
Alterar:
- `src/integrations/agent_runtime/sandcastle_api.ts` (expor `claudeCode`, `Output.object`, `StructuredOutputError`)
- `src/integrations/agent_runtime/sandcastle_agent_runtime.ts`
- `src/test/fakes/fake_sandcastle_api.ts`

### Contratos
```ts
export function buildRunOptions(request: AgentRunRequest, deps: { api: SandcastleApi; logFilePath: string; onEvent(e: AgentEvent): void }): SandcastleRunOptions;
export function withOutputInstruction(prompt: string, schema?: Record<string, unknown>): string;
// acrescenta: "## Saída\nTermine sua resposta com um bloco <output>…</output> contendo JSON que siga este schema: ```json …```"
export function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType; // subconjunto: object, properties, required, string, number, integer, boolean, array, enum
export function mapStreamEvent(event: SandcastleStreamEvent): AgentEvent;  // text | toolCall | raw → kinds de #{ENG-01}
export function sumUsage(iterations: { usage?: TokenUsage }[]): TokenUsage;
export function toAgentError(error: unknown, now: Date): Error; // usa parseUsageLimit (#{RT-04}); StructuredOutputError; abort → AgentCanceledError; idle → AgentTimeoutError("idle")
```

### Semântica
- `prompt` vai inline (`prompt`, não `promptFile`) já renderizado pela Forja; **não** passe `promptArgs`. Prompts com
  `` !`comando` `` executam o comando no sandbox (recurso do Sandcastle usado nos prompts do pipeline atual) — mantenha
  o comportamento e documente-o no tooltip do editor de prompt (#{EDT-05}) numa nota do PR.
- `maxIterations` do nó; `idleTimeoutSeconds = idleTimeoutMinutes × 60`; timeout total via `AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)])` — timeout vira `AgentTimeoutError("total")`.
- Com `outputSchema`: `output: Output.object({ tag: "output", schema: jsonSchemaToZod(schema) })` e
  `withOutputInstruction`; resultado em `AgentRunResult.output`. (O Sandcastle exige `maxIterations: 1` com saída
  estruturada; se o nó tiver `maxIterations > 1` e schema, rode as iterações sem `output` e faça **uma iteração extra**
  de `resume`/`run` pedindo só o bloco `<output>` — se `resume` não estiver disponível, valide falha com mensagem clara.)
- Sem schema: `summary` = último trecho de texto do agente (4 000 chars).
- `usage` = soma de `iterations[].usage`; `sessionId` = da última iteração.
- Eventos `onAgentStreamEvent` → `mapStreamEvent` → `request`/`hooks.onEvent` em tempo real.
- `permissionMode` do perfil (#{CFG-04}) vai para `claudeCode(..., { permissionMode })`.

### Passo a passo
1. `output_schema.ts` (conversão + instrução) com testes.
2. `agent_event_mapper.ts` com testes.
3. `run_agent_node.ts` e uso em `runAgent`/`runHeadless`.
4. Fachada falsa: roteiro de eventos, iterações com `usage`, `commits`, saída válida/inválida, erro com mensagem de limite.

## Critérios de aceite
- [ ] `claudeCode` recebe o modelo e `{ effort, permissionMode }` do request.
- [ ] Eventos chegam ao `onEvent` durante a execução, na ordem.
- [ ] Saída que casa com o schema aparece em `output`; saída inválida lança `StructuredOutputError` com o texto bruto.
- [ ] Erro "5-hour limit reached ∙ resets 3pm" vira `UsageLimitError` com `resetAt`.
- [ ] Abortar o sinal vira `AgentCanceledError`; estourar `timeoutMs` vira `AgentTimeoutError("total")`.
- [ ] `usage` soma as iterações.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `output_schema.test.ts`, `agent_event_mapper.test.ts`, `run_agent_node.test.ts` (fachada falsa) com os critérios acima.
