---
key: FLW-01
title: "Contrato FlowGraph e configs de todos os tipos de nó"
type: issue
milestone: "Fase 3 — Modelo de fluxo"
labels: [tipo:feature, area:fluxo]
depends_on: [F-01]
---

## Contexto
O grafo do fluxo é o contrato entre o editor (Fase 4), o motor (Fase 5), o runtime (Fase 6) e o YAML exportado. Ver
PRD, "Modelo de execução". Para que canvas e motor possam ser construídos em paralelo, esta issue declara **todos os
tipos de nó e grupo do MVP** de uma vez; issues seguintes só consomem (ou ajustam o arquivo do seu tipo em
`src/shared/node_configs/`).

## Objetivo
Existem os schemas Zod e tipos de `FlowGraph`, `FlowNode`, `Port`, `FlowEdge`, `FlowGroup` e das configs dos oito
tipos de nó, com `parseFlowGraph` e uma fábrica `createDefaultNode(type)` testadas.

## Escopo
**Inclui:** schemas e tipos, defaults de cada tipo (portas e config), condição declarativa, fixtures de grafo para testes.
**Não inclui:** validação semântica (#{FLW-02}), templates de prompt (#{FLW-03}), persistência (#{FLW-04}).

## Especificação técnica
### Arquivos
Criar:
- `src/shared/flow_graph.ts`
- `src/shared/conditions.ts`
- `src/shared/node_configs/trigger_config.ts`
- `src/shared/node_configs/source_config.ts`
- `src/shared/node_configs/agent_config.ts`
- `src/shared/node_configs/script_config.ts`
- `src/shared/node_configs/condition_config.ts`
- `src/shared/node_configs/gate_config.ts`
- `src/shared/node_configs/git_config.ts`
- `src/shared/node_configs/output_config.ts`
- `src/shared/node_defaults.ts`
- `src/shared/validation_issue.ts`
- `src/shared/agent_types.ts`
- `src/test/factories/flow_graph_factory.ts`
- `src/shared/flow_graph.test.ts`
- `src/shared/node_defaults.test.ts`

### Contratos
```ts
export const PORT_TYPES = ["text", "json", "workItem", "workItemList", "branch", "prUrl", "any"] as const;
export const portSchema = z.object({ name: z.string().regex(/^[a-z][a-zA-Z0-9_]*$/), type: z.enum(PORT_TYPES),
    required: z.boolean().default(true), schema: z.record(z.string(), z.unknown()).optional() });
export const NODE_TYPES = ["trigger", "source", "agent", "script", "condition", "gate", "git", "output"] as const;

// src/shared/agent_types.ts — fonte única; configurações (#{CFG-04}, #{CFG-05}) e runtime (#{ENG-01}) importam daqui
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];
export const PERMISSION_MODES = ["default", "acceptEdits", "plan", "auto", "dontAsk", "bypassPermissions"] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

// condições declarativas (sem eval de código do usuário)
export type Condition =
    | { op: "eq" | "neq"; path: string; value: string | number | boolean }   // path: "review.approved", "tests.exitCode"
    | { op: "gt" | "lt"; path: string; value: number }
    | { op: "exists"; path: string }
    | { op: "and" | "or"; conditions: Condition[] }
    | { op: "not"; condition: Condition };

// configs (cada uma em seu arquivo em node_configs/)
triggerConfig   = { kind: "manual" | "schedule" | "event" | "webhook" | "board_column" }   // detalhes do gatilho vivem em Trigger (#{TRG-01})
sourceConfig    = { provider: "github" | "local"; label?: string; state: "open"; limit: number (1–100, padrão 20); skipBlocked: boolean (padrão true) }
agentConfig     = { prompt: string; model?: string; effort?: Effort; maxIterations: number (1–200, padrão 1);
                    toolProfileId?: string; credentialId?: string; outputSchema?: JsonSchema;
                    workspace: "item" | "none"; timeoutMinutes: number (padrão 60); idleTimeoutMinutes: number (padrão 10);
                    retries: number (0–5, padrão 1); completionSignal?: string }
scriptConfig    = { command: string; timeoutMinutes: number (padrão 15); workspace: "item" }
conditionConfig = { condition: Condition }                       // portas de saída fixas: "true" e "false"
gateConfig      = { message: string; show: ("diff" | "artifacts" | "logs")[]; timeoutHours?: number }
gitConfig       = { action: "rebase" | "push" | "open_pr"; baseBranch?: string; draft: boolean; bodyFrom?: string /* porta */ }
outputConfig    = { moveItemTo?: "done" | "needs_human"; commentOnIssue: boolean }

export const flowNodeSchema = z.discriminatedUnion("type", [/* um objeto por tipo: { id, type, label, position, parentGroupId?, inputs, outputs, config } */]);
export const flowEdgeSchema = z.object({ id: z.string(), from: z.object({ nodeId: z.string(), port: z.string() }), to: z.object({ nodeId: z.string(), port: z.string() }) });
export const mapConfigSchema = z.object({ concurrency: z.number().int().min(1).max(16).default(1), barrier: z.boolean().default(false), failFast: z.boolean().default(false) });
export const loopConfigSchema = z.object({ maxIterations: z.number().int().min(1).max(50).default(3), until: conditionSchema, carry: z.array(z.string()).default([]) });
export const flowGroupSchema = z.discriminatedUnion("kind", [ /* map | loop */ ]); // { id, kind, label, parentGroupId?, position, size, config }
export const flowGraphSchema = z.object({ schemaVersion: z.literal(1), nodes: z.array(flowNodeSchema), edges: z.array(flowEdgeSchema), groups: z.array(flowGroupSchema) });
export type FlowGraph = z.infer<typeof flowGraphSchema>;
export function parseFlowGraph(input: unknown): FlowGraph; // lança FlowGraphParseError com caminhos legíveis
export function createDefaultNode(type: NodeType, id: string, position: { x: number; y: number }): FlowNode;
```
Portas padrão por tipo (de `node_defaults.ts`):
- `trigger`: saídas `items: workItemList` (obrigatória: não).
- `source`: entrada `trigger: any` (opcional); saída `items: workItemList`.
- `agent`: entrada `item: workItem` (opcional), `context: text` (opcional); saída `result: json`, `summary: text`.
- `script`: entrada `item: workItem`; saída `result: json` (`{ exitCode, stdoutTail }`).
- `condition`: entrada `value: json`; saídas `true: any`, `false: any`.
- `gate`: entrada `item: workItem`; saídas `approved: workItem`, `rejected: workItem`.
- `git`: entrada `item: workItem`, `body: text` (opcional); saída `result: json` (`{ branch, prUrl? }`).
- `output`: entrada `item: workItem`.
O usuário pode acrescentar portas a nós `agent` (ex.: `spec: text`); os demais têm portas fixas.

### Passo a passo
1. Escreva os schemas de cada config no seu arquivo e o `flowNodeSchema` discriminado.
2. `conditions.ts`: schema recursivo com `z.lazy` e `evaluateCondition(condition, data): boolean` puro (path com pontos; ausente → `false`, exceto `not`).
3. `node_defaults.ts`: portas e config padrão por tipo.
4. `flow_graph_factory.ts`: `buildCanonicalFlow()` — o fluxo do PRD: trigger → source → map(TL, 1) →
   map(Dev, 3) → map(Reviewer → git open_pr, 1) → output, com a aresta `TL.summary → Dev.spec` correlacionada por
   item entre maps — e `buildLoopFlow()` (map com loop Dev → script de testes → Reviewer). Usados pelos testes do
   motor e do editor.
5. `src/shared/validation_issue.ts`: o tipo `ValidationIssue` (abaixo), usado por #{FLW-02} e #{FLW-03}, que rodam em paralelo:
   ```ts
   export interface ValidationIssue {
       level: "error" | "warning"; code: string; message: string;
       target: { kind: "node" | "edge" | "group" | "flow"; id?: string };
   }
   ```
6. Testes.

## Critérios de aceite
- [ ] `parseFlowGraph(buildCanonicalFlow())` passa; grafo com tipo de nó desconhecido falha com caminho do erro.
- [ ] `createDefaultNode` devolve portas e config padrão de cada um dos oito tipos.
- [ ] `evaluateCondition` cobre `eq`, `neq`, `gt`, `lt`, `exists`, `and`, `or`, `not` e path ausente.
- [ ] `map.concurrency` 0 ou 17 e `loop.maxIterations` 0 ou 51 são rejeitados.
- [ ] Nada em `src/shared/` importa código de servidor ou de web.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `flow_graph.test.ts`: fluxos das fábricas válidos; erros de parse; limites de grupo.
- `node_defaults.test.ts`: portas por tipo.
- Testes de `evaluateCondition` em `src/shared/conditions.test.ts` (criar).
