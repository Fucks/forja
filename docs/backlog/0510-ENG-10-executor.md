---
key: ENG-10
title: "Executor: liga motor, runtime de agente, banco e eventos"
type: issue
milestone: "Fase 5 — Motor de execução"
labels: [tipo:feature, area:motor]
depends_on: [ENG-08, ENG-09, F-06, FLW-04, PRJ-01, CFG-05, BRD-01]
---

## Contexto
O scheduler (#{ENG-03}…#{ENG-08}) só decide; esta issue é a "casca imperativa": interpreta os comandos, abre um
workspace por item no `AgentRuntime`, roda os nós de agente com o prompt renderizado (#{FLW-03}), grava cada
transição (#{ENG-09}) e publica eventos (#{F-06}). Depois dela, um fluxo roda de ponta a ponta com o
`FakeAgentRuntime` — o ciclo central do produto.

## Objetivo
Existe `createExecutor(deps)` que inicia uma run de uma versão publicada para uma lista de itens, executa nós `agent`
via `AgentRuntime`, persiste e publica cada mudança, e conclui a run; testado de ponta a ponta com o fake.

## Escopo
**Inclui:** executor, registro de executores de nó (`node_executors.ts`) com o executor de `agent`, gestão de workspaces
por item (abrir na primeira necessidade, fechar quando o item termina), renderização de prompt, mapeamento de erros
do runtime para `FailureKind`, timers do scheduler via `Clock`.
**Não inclui:** nós trigger/script/condition/output (#{ENG-13}), source (#{BRD-04}), git (#{GIT-01}), gate (#{GIT-03}),
logs em arquivo (#{RT-03}), uso persistido (#{RT-05}), recuperação (#{ENG-11}), API (#{ENG-12}).

## Especificação técnica
### Arquivos
Criar:
- `src/server/runtime/executor.ts`
- `src/server/runtime/node_executors.ts`
- `src/server/runtime/executors/agent_executor.ts`
- `src/server/runtime/workspace_pool.ts`
- `src/server/runtime/error_mapping.ts`
- `src/server/runtime/run_context.ts`
- `src/server/runtime/executor.test.ts`
- `src/server/runtime/workspace_pool.test.ts`
- `src/integrations/agent_runtime/unavailable_agent_runtime.ts` (implementa `AgentRuntime` rejeitando tudo com
  `WorkspaceError("Runtime de agentes ainda não configurado")`; é o que `main.ts` usa até #{RT-03} ligar o runtime Docker
  e #{OBS-06} ligar o modo demo — código de produção nunca importa de `src/test/`)
Alterar:
- `src/server/app.ts` e `src/server/main.ts` (`AppDeps` ganha `agentRuntime` e `executor`)

### Contratos
```ts
export interface NodeExecutionContext {
    run: RunRecord; nodeRun: NodeRunState; node: FlowNode; graph: FlowGraph; inputs: Record<string, unknown>;
    item?: WorkItemSnapshot; project: Project; settings: ProjectSettings;
    workspaces: WorkspacePool; runtime: AgentRuntime; clock: Clock; signal: AbortSignal;
    onAgentEvent(event: AgentEvent): void;     // #{RT-03} grava em arquivo; aqui só publica `log.appended` numerado em memória
}
export interface NodeExecutionResult { outputs: Record<string, unknown>; artifacts?: Omit<ArtifactRecord, "id" | "nodeRunId" | "runId" | "createdAt">[]; usage?: TokenUsage & { costUsd?: number } }
export type NodeExecutor = (ctx: NodeExecutionContext) => Promise<NodeExecutionResult>;
export const nodeExecutors: Partial<Record<NodeType, NodeExecutor>>; // aqui: agent. Cadeia: #{ENG-13} → #{BRD-04} → #{GIT-01} → #{GIT-03}

export interface WorkItemSnapshot { id: string; title: string; body: string; number?: number; url?: string; labels: string[]; branch: string }
export interface ItemSource { getItems(projectId: string, ids: string[]): Promise<WorkItemSnapshot[]> } // em produção: `WorkItemService.snapshots` de #{BRD-01}; nos testes, um fake

export interface Executor {
    startRun(input: { projectId: string; flowId: string; version?: number /* padrão: última publicada */; itemIds: string[]; triggerId?: string }): Promise<RunRecord>;
    cancelRun(runId: string): Promise<void>;
    pauseRun(runId: string): Promise<void>;
    resumeRun(runId: string): Promise<void>;
    cancelNodeRun(nodeRunId: string): Promise<void>;
    retryNodeRun(nodeRunId: string): Promise<void>;
    activeRunIds(): string[];
}
export function createExecutor(deps: { runs: RunRepository; flows: FlowService; projects: ProjectService; settings: SettingsService;
    items: ItemSource; runtime: AgentRuntime; events: EventBus; clock: Clock; newId(p: IdPrefix): string }): Executor;

export function mapAgentError(error: unknown): NonNullable<NodeRunState["error"]>; // UsageLimitError → usage_limit, AgentTimeoutError → timeout_total|timeout_idle, ...
```
Pausa/retomada pelo usuário: acrescente ao scheduler os eventos `pause_requested`/`resume_requested` (altere
`src/engine/scheduler.ts`, `scheduler_types.ts` e o teste) — run `PAUSED` com `pauseReason: "user"`, nada novo começa.

### Semântica
- `startRun`: carrega a versão publicada (erro 422 se não houver), cria `RunRecord` QUEUED, cria o scheduler com
  opções de `GlobalSettings`/`ProjectSettings` (tetos, intervalo, margem de limite, orçamento diário com o gasto do dia = 0
  até #{RT-05}), envia `start` e executa os comandos.
- `start_node_run` de agente: `resolveAgentDefaults` (#{CFG-05}) → `renderPrompt` com `PromptContext` → anexa
  `settings.systemPrompt` ao fim do prompt (seção "## Convenções do projeto") → workspace: `item` usa
  `workspaces.acquire(item)` (abre com branch `item.branch` na primeira vez), `none` usa `runtime.runHeadless` → resultado
  vira `outputs` (`result` = `output` estruturado, `summary` = `summary`) e eventos `usage_recorded` + `node_run_succeeded`.
- Erro → `mapAgentError` → `node_run_failed`.
- `cancel_node_run` aborta o `AbortController` daquele NodeRun.
- Item concluído (sucesso, falha ou exhausted) em toda a run → `workspaces.release(item)` fecha o container. Run terminal → fecha todos.
- `start_node_run` grava `inputs` no NodeRun (truncado acima de 256 KB) — a tela do NodeRun (#{OBS-02}) mostra entradas e saídas.
- Cada comando `*_changed` → `runs.saveTransition` (com `scheduler.snapshot()`) **antes** de publicar o evento no bus.
- `schedule_wakeup` → `clock.setTimeout` que chama `tick`.
- `usage_limit_reached` / `usage_limit_reset` (#{ENG-08}) → publicar `usage.limit_reached` / `usage.limit_reset` no EventBus; `group_progress` → `group.progress`.
- Branch do item: `forja/issue-<número>` para issues do GitHub; `forja/item-<id curto>` para itens locais.

### Passo a passo
1. `error_mapping.ts`, `run_context.ts` (monta `PromptContext`), `workspace_pool.ts` (contagem de uso por item, abrir uma vez mesmo com pedidos concorrentes).
2. `agent_executor.ts` e o registro.
3. Loop do executor por run (fila de eventos serializada por run para não intercalar `handle`).
4. Integração em `app.ts`/`main.ts`.
5. Teste de ponta a ponta: `buildCanonicalFlow()` publicado num banco de teste, 4 itens, `FakeAgentRuntime`, `FakeClock`.

## Critérios de aceite
- [ ] O fluxo canônico com 4 itens termina `SUCCEEDED` no fake, com o pico de 3 Devs simultâneos e 1 Reviewer por vez.
- [ ] Cada item usa um único workspace aberto uma vez e fechado ao final; nós `none` usam `runHeadless`.
- [ ] O prompt enviado ao runtime contém as variáveis renderizadas e o system prompt do projeto.
- [ ] Toda transição é gravada antes do evento correspondente ser publicado (teste verifica a ordem).
- [ ] Pausar a run impede novos inícios; retomar continua.
- [ ] Erro de limite de uso no fake pausa a run e retoma após o `resumeAt`.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `executor.test.ts`: ponta a ponta com fakes (InMemoryRunRepository ou `createTestDb`), ordem gravar→publicar, pausa/retomada, cancelamento, limite de uso.
- `workspace_pool.test.ts`: aquisição concorrente abre uma vez; release fecha.
