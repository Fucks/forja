---
key: ENG-05
title: "Executar grupo loop com condição de saída e teto"
type: issue
milestone: "Fase 5 — Motor de execução"
labels: [tipo:feature, area:motor]
depends_on: [ENG-04]
---

## Contexto
Atende RF-RUN-03. O segundo template (#{FLW-06}) repete "Dev → testes → Reviewer" até o revisor aprovar, com teto de
3 iterações. Loops sem teto queimam tokens (dor do benchmark); por isso todo loop tem `maxIterations` e saída
`exhausted`. Loops podem estar dentro de maps (um loop por item).

## Objetivo
Existe `loop_group.ts` puro que, integrado ao scheduler, repete o subgrafo do loop até `until` ser verdadeiro sobre as
saídas da iteração ou atingir o teto, passando as portas `carry` adiante e saindo pela porta `exhausted` no teto.

## Escopo
**Inclui:** estado do loop por item, avaliação de `until` com `evaluateCondition` (#{FLW-01}), carry, iteração nos NodeRuns, saída `exhausted`.
**Não inclui:** custo por iteração na UI (#{OBS-05}).

## Especificação técnica
### Arquivos
Criar:
- `src/engine/loop_group.ts`
- `src/engine/loop_group.test.ts`
Alterar:
- `src/engine/scheduler.ts`
- `src/engine/scheduler.test.ts`

### Contratos
```ts
export interface LoopInstanceState {
    groupId: string; itemId?: string; iteration: number; maxIterations: number;
    status: "running" | "succeeded" | "exhausted" | "failed" | "canceled";
    carry: Record<string, unknown>;  // valores das portas carry da última iteração
}
export function startLoop(group: FlowGroup & { kind: "loop" }, itemId?: string): LoopInstanceState;
export function iterationData(graph: FlowGraph, group: FlowGroup, outputsByNodeId: Record<string, Record<string, unknown>>): Record<string, unknown>;
// monta { "<slug-do-rótulo-do-nó>": { <porta>: valor } } — ex.: { review: { approved: false, notes: "…" }, tests: { exitCode: 1 } }
export function decideAfterIteration(state: LoopInstanceState, until: Condition, data: Record<string, unknown>, carryPorts: string[]): { state: LoopInstanceState; next: "repeat" | "exit" | "exhausted" };
```
Slug do rótulo: minúsculas, sem acento, espaços → `_` ("Revisar" → `revisar`). O PRD e as dicas do `ConditionEditor`
(#{EDT-06}) usam esse mesmo slug — exporte `nodeSlug(label)` de `src/shared/node_slug.ts` (criar) para os dois lados.

### Semântica
- Iteração `n` cria NodeRuns com `iteration = n` (1-based) para todos os nós do loop; o mesmo item, o mesmo workspace.
- Fim da iteração = todos os NodeRuns daquela iteração terminais. Se algum falhou (após retentativas, #{ENG-06}), o loop
  falha (`failed`) e o item falha no map que o contém.
- `until` verdadeiro → `exit`: as saídas da última iteração saem pelas arestas que deixam o loop.
- Falso e `iteration < maxIterations` → `repeat`: valores das portas `carry` ficam disponíveis como `inputs.<porta>`
  na próxima iteração (o prompt do Dev lê `{{inputs.notes}}`).
- Falso e no teto → `exhausted`: só as arestas que saem da porta especial `exhausted` do grupo seguem (ex.: para um
  `output(needs_human)`); as demais ficam `SKIPPED` para aquele item.
- Loop dentro de map: uma instância por item; a iteração do loop não conta como item novo do map.

### Passo a passo
1. Funções puras e `nodeSlug`.
2. Integração: o scheduler cria NodeRuns por iteração e consulta `decideAfterIteration` ao fim de cada uma.
3. Porta `exhausted` do grupo: aresta cujo `from` é `{ nodeId: <groupId>, port: "exhausted" }` (documente no tipo `FlowEdge` em comentário; ajuste a validação de #{FLW-02} se necessário).
4. Testes com o `buildLoopFlow()` de #{FLW-01}.

## Critérios de aceite
- [ ] Reviewer aprovando na 2ª iteração: o loop termina com 2 iterações e segue para o PR.
- [ ] Reviewer nunca aprova com teto 3: 3 iterações e o item sai por `exhausted` para "precisa de humano".
- [ ] `inputs.notes` da iteração 2 contém as notas do Reviewer da iteração 1.
- [ ] Loop dentro de map com 2 itens mantém iterações independentes por item.
- [ ] Falha não recuperável dentro do loop faz o item falhar.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `loop_group.test.ts`: `iterationData`, `decideAfterIteration` (exit, repeat, exhausted), carry, `nodeSlug`.
- `scheduler.test.ts`: os cenários acima com `FakeAgentRuntime` roteirizado por iteração (`promptIncludes`/`times`).
