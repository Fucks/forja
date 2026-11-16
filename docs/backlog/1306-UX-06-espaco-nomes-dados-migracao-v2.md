---
key: UX-06
title: "Espaço de nomes único de dados e migração do grafo para schemaVersion 2"
type: issue
milestone: "Fase 12 — Experiência de criação de fluxos"
labels: [tipo:feature, area:motor, area:fluxo]
depends_on: [UX-04]
---

## Contexto

Atende RF-EDT-11 e RF-EDT-12 (épico #185) e corrige um bug. Hoje existem **três dialetos de caminho**:

- o prompt usa `PromptContext` (`inputs.*`, `item.*`, `project.*`, `run.*`, em `src/engine/prompt_template.ts`);
- a **Decisão** avalia a regra sobre o valor da porta `value`
  (`evaluateCondition(config.condition, inputs.value)` em `src/server/runtime/executors/condition_executor.ts`), então
  o caminho é relativo a esse valor (`approved`);
- o `until` do **Loop** avalia sobre `{ "<slug>": { <porta>: valor } }` (`iterationData` em `src/engine/loop_group.ts`).

O editor sugere para a Decisão os caminhos do formato do Loop (`listUpstreamOutputPaths` em
`src/web/canvas/inspector/condition_suggestions.ts` devolve `reviewer.result`). **Quem aceita a sugestão monta uma
condição que nunca é verdadeira.** O `bodyFrom` do Git (`lookUpPath(inputs, bodyFrom)`) tem o mesmo problema de
dialeto. Esta issue unifica tudo num `DataContext` e migra os grafos existentes sem perder nada.

## Objetivo

Decisão, Loop, prompt, `bodyFrom` do Git e (a partir de #{UX-10}) Comando leem o mesmo `DataContext`, com `item.*`,
`inputs.<porta>.*`, `nodes.<slug>.<porta>.*`, `run.*` e `project.*`. Grafos `schemaVersion: 1` são migrados
automaticamente para `schemaVersion: 2` ao serem lidos (banco, API, YAML), e as sugestões da Decisão passam a gerar
caminhos que funcionam.

## Escopo

**Inclui:** tipo `DataContext`; `migrateFlowGraph` v1→v2; `collectUpstreamOutputs` no motor; `upstreamOutputs` no
contexto dos executores; Decisão, Loop, Git e prompt lendo o `DataContext`; validação de variáveis aceitando `nodes.*`;
templates e fixtures em v2; correção imediata das sugestões em `condition_suggestions.ts`.
**Não inclui:** o modelo tipado de dados disponíveis e o `DataPicker` (#{UX-07}); operadores novos (#{UX-09});
o Comando (#{UX-10}).

## Especificação técnica

### Arquivos

Criar:

- `src/shared/data_context.ts`
- `src/shared/migrate_flow_graph.ts`
- `src/shared/migrate_flow_graph.test.ts`
- `src/engine/upstream_outputs.ts`
- `src/engine/upstream_outputs.test.ts`

Alterar:

- `src/shared/flow_graph.ts` (`schemaVersion: z.literal(2)`; `flowGraphSchema = z.preprocess(migrateFlowGraph, <schema v2>)`)
- `src/engine/graph_queries.ts` (exportar `listUpstreamNodes(graph, nodeId): FlowNode[]`, movendo a busca em largura
  hoje em `condition_suggestions.ts`)
- `src/engine/prompt_template.ts` (`PromptContext` passa a ser `DataContext`)
- `src/engine/loop_group.ts` (`iterationData` devolve `{ nodes: { <slug>: { <porta>: valor } } }`)
- `src/engine/validation_rules/agent_rules.ts` (variável `{{nodes.<slug>.<porta>...}}` válida quando o slug é de um nó
  anterior no caminho; `nodes.` de nó inexistente ou posterior é erro "Variável aponta para um nó que não vem antes deste")
- `src/server/runtime/node_executors.ts` (`NodeExecutionContext.upstreamOutputs: Record<string, Record<string, unknown>>`)
- `src/server/runtime/node_run_execution.ts` (deps e `contextFor` repassam `upstreamOutputs`)
- `src/server/runtime/executor.ts` (calcula `upstreamOutputs` com `collectUpstreamOutputs` ao montar o NodeRun; o ponto
  em que `findNodeRun` já é passado ao scheduler)
- `src/server/runtime/run_context.ts` (`buildDataContext(context: NodeExecutionContext): DataContext`; `buildPromptContext`
  passa a usá-lo)
- `src/server/runtime/executors/condition_executor.ts` (`evaluateCondition(config.condition, buildDataContext(context))`;
  continua enviando `inputs.value` pela porta escolhida)
- `src/server/runtime/executors/git_executor.ts` (`summaryFromInputs` usa `lookUpPath(buildDataContext(context), bodyFrom)`)
- `src/server/flows/flow_yaml.ts` (exporta v2; importa v1 via schema)
- `src/server/flows/templates/basic_factory.ts`, `review_loop.ts`, `sandcastle_pipeline.ts` (v2 e caminhos novos)
- `src/web/canvas/inspector/condition_suggestions.ts` (sugestões `nodes.<slug>.<porta>` para Decisão e Loop, usando
  `listUpstreamNodes`)
- testes e fixtures com `schemaVersion: 1` (`grep -rn "schemaVersion: 1" src e2e`): passam para 2, **exceto** as
  fixtures dos testes de migração

### Contratos

```ts
// src/shared/data_context.ts
export const DATA_ROOTS = ["item", "inputs", "nodes", "run", "project"] as const;
export type DataRoot = (typeof DATA_ROOTS)[number];

export interface DataContext {
    inputs: Record<string, unknown>;
    nodes: Record<string, Record<string, unknown>>; // slug do nó → porta → valor
    item?: { id: string; title: string; body: string; number?: number; url?: string; labels: string[]; branch?: string };
    project: { name: string; baseBranch: string; githubRepo?: string };
    run: { id: string; iteration: number; attempt: number };
}

// src/shared/migrate_flow_graph.ts
/** Recebe qualquer JSON; se for um grafo v1, devolve o equivalente v2. Demais entradas passam intactas. */
export function migrateFlowGraph(input: unknown): unknown;

// src/engine/upstream_outputs.ts
export function collectUpstreamOutputs(
    graph: FlowGraph,
    nodeId: string,
    workItemId: string | undefined,
    findNodeRun: (nodeId: string, workItemId: string | undefined) => NodeRunState | undefined,
): Record<string, Record<string, unknown>>;
```

### Semântica

- `nodes.<slug>`: saídas do **último NodeRun SUCCEEDED** de cada nó anterior no caminho (`listUpstreamNodes`). Para nós
  por item, é o NodeRun do mesmo item; para nós por run, o NodeRun sem item. Nó anterior que não rodou (ramo pulado)
  fica **ausente**, e `exists` devolve falso.
- No **Loop**, `until` continua vendo **só** os nós de dentro do grupo, na iteração que acabou de terminar, agora sob
  `nodes.*`.
- Migração v1→v2, pura e idempotente:
  1. `schemaVersion: 1` → `2`.
  2. Nó `condition`: em toda comparação (recursivo em `and`/`or`/`not`), `path` → `inputs.value.<path>`.
  3. Grupo `loop`: em toda comparação de `until`, `path` → `nodes.<path>`.
  4. Nó `git` com `bodyFrom`: `bodyFrom` → `inputs.<bodyFrom>`.
  5. Um grafo que já está em v2 volta idêntico.
- Grafos guardados no banco (`draft_json`, versões publicadas, snapshots de run) **não são reescritos em massa**: a
  migração acontece na leitura (`parseFlowGraph`), e o próximo salvamento do rascunho grava em v2. Uma run recuperada
  após reinício (`recovery.ts`) com snapshot v1 também migra na leitura. Confira se `stored_snapshot.ts` passa por
  `parseFlowGraph`; se não passar, faça passar.
- Slugs repetidos: se dois nós anteriores tiverem o mesmo `nodeSlug(label)`, `nodes.<slug>` fica ambíguo. Se
  `identity_rules.ts` ainda não proíbe isso, adicione o erro "Dois nós com o mesmo nome (<slug>): renomeie um deles".

### Passo a passo

1. Escreva `migrateFlowGraph` com testes primeiro (red-green).
2. Plugue a migração no `flowGraphSchema` com `z.preprocess` e atualize os tipos (`FlowGraph` = saída v2).
3. Mova a busca em largura para `listUpstreamNodes` e escreva `collectUpstreamOutputs`.
4. Leve `upstreamOutputs` até `NodeExecutionContext` e crie `buildDataContext`.
5. Troque Decisão, Git, Loop e prompt para o `DataContext`.
6. Atualize as sugestões, os templates e os literais `schemaVersion`.
7. Rode a suíte inteira; `flow_templates.test.ts` e `sandcastle_pipeline.test.ts` precisam continuar verdes.

## Critérios de aceite

- [ ] Uma Decisão v1 com `approved == true`, ligada a `Reviewer.result`, migra para `inputs.value.approved == true` e
      escolhe o mesmo ramo antes e depois.
- [ ] Uma Decisão v2 com `nodes.reviewer.result.approved == true`, **sem** ligação de `value` vinda do Reviewer, escolhe
      Sim quando o Reviewer aprovou.
- [ ] Um Loop v1 com `until: reviewer.result.approved == true` migra para `nodes.reviewer.result.approved` e sai na
      mesma iteração.
- [ ] O Git com `bodyFrom: "summary"` migra para `inputs.summary`, e o comportamento atual se mantém. No fluxo padrão,
      `reviewer.summary → body` com `bodyFrom: "summary"` já não acha o texto hoje; a correção e o aviso vêm em #{UX-13}.
- [ ] Importar o YAML v1 de um template funciona; exportar gera v2.
- [ ] As sugestões da Decisão começam com `nodes.` e funcionam (teste de ponta a ponta com o executor).
- [ ] `{{nodes.tl.summary}}` num prompt do Dev renderiza o resumo do TL; `{{nodes.dev.summary}}` no próprio TL é erro
      de validação.
- [ ] `migrateFlowGraph(migrateFlowGraph(g))` é igual a `migrateFlowGraph(g)`.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `migrate_flow_graph.test.ts`: cada regra; `and`/`or`/`not` aninhados; idempotência; o grafo do fluxo "Padrao" (copie o
  JSON do #185 para uma fixture v1) migrando sem perder nós, arestas nem grupos.
- `upstream_outputs.test.ts`: nós por item e por run; ramo pulado ausente; último NodeRun SUCCEEDED vence uma
  retentativa FAILED.
- `deterministic_executors.test.ts`: Decisão com `nodes.*` e com `inputs.value.*`.
- `loop_group.test.ts`: `until` com `nodes.*`.
- `git_executor.test.ts`: `bodyFrom` com `inputs.*` e `nodes.*`.
- `prompt_template.test.ts` e os testes de `agent_rules`: variáveis `nodes.*` válidas e inválidas.
