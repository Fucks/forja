---
key: FLW-02
title: "Validação do grafo do fluxo"
type: issue
milestone: "Fase 3 — Modelo de fluxo"
labels: [tipo:feature, area:fluxo]
depends_on: [FLW-01]
---

## Contexto
Atende RF-EDT-05. Publicar um fluxo inválido gera runs que falham no meio da noite. A validação semântica roda no
editor a cada mudança (#{EDT-08}) e no servidor antes de publicar (#{FLW-04}); por isso é uma função pura em
`src/engine/`, usada pelos dois lados. Também expõe consultas de grafo (vizinhos, membros de grupo, ordem
topológica) que o scheduler (#{ENG-03}) reutiliza.

## Objetivo
`validateFlowGraph(graph, context)` devolve a lista de problemas com nível, mensagem em português e alvo (nó, aresta
ou grupo), cobrindo todas as regras do PRD.

## Escopo
**Inclui:** regras de validação, consultas de grafo puras.
**Não inclui:** variáveis de prompt (validadas via #{FLW-03}, que esta issue chama por injeção opcional), UI.

## Especificação técnica
### Arquivos
Criar:
- `src/engine/graph_queries.ts`
- `src/engine/graph_validation.ts`
- `src/engine/graph_queries.test.ts`
- `src/engine/graph_validation.test.ts`

### Contratos
```ts
import type { ValidationIssue } from "@/shared/validation_issue"; // criado em #{FLW-01}
export interface ValidationContext {
    knownToolProfileIds?: string[]; knownCredentialIds?: string[];
    checkPrompt?(node: AgentNode, graph: FlowGraph): ValidationIssue[]; // ligado a #{FLW-03}
}
export function validateFlowGraph(graph: FlowGraph, context?: ValidationContext): ValidationIssue[];

// graph_queries.ts
export function incomingEdges(graph: FlowGraph, nodeId: string): FlowEdge[];
export function outgoingEdges(graph: FlowGraph, nodeId: string): FlowEdge[];
export function groupMembers(graph: FlowGraph, groupId: string): { nodeIds: string[]; childGroupIds: string[] }; // diretos
export function enclosingGroups(graph: FlowGraph, nodeId: string): FlowGroup[]; // do mais interno ao mais externo
export function groupBoundaryEdges(graph: FlowGraph, groupId: string): { entering: FlowEdge[]; leaving: FlowEdge[]; back: FlowEdge[] };
export function topologicalOrder(graph: FlowGraph): string[]; // ignora arestas de volta dentro de loops; lança se houver ciclo fora de loop
export function areTypesCompatible(from: PortType, to: PortType): boolean;
```
Regras (código → mensagem):
- `no_trigger` / `many_triggers`: exatamente um nó `trigger`.
- `dangling_edge`: aresta aponta para nó ou porta inexistente.
- `required_input_unconnected`: porta obrigatória sem aresta.
- `incompatible_ports`: `areTypesCompatible` falso (`any` aceita e fornece tudo; `workItemList` → `workItem` só quando o destino está dentro de um `map` e a aresta cruza a borda do map; `workItem` → `workItemList` é sempre inválido).
- `required_input_unconnected` não se aplica à porta `item: workItem` de nós dentro de um map (o item é implícito, ver PRD).
- Aresta entre nós de **maps irmãos** (origem dentro do map A, destino dentro do map B, A ≠ B, nenhum contém o outro) é
  **correlacionada por item** e válida; `graph_queries` expõe `isItemCorrelatedEdge(graph, edge): boolean`.
- `cycle_outside_loop`: ciclo que não está inteiramente dentro de um grupo `loop`.
- `loop_without_back_edge` (warning): loop cujo subgrafo não tem aresta de volta.
- `group_overlap`: nó com `parentGroupId` inexistente, grupo pai de si mesmo ou ciclo de pais.
- `map_without_list_input`: grupo `map` sem aresta de entrada do tipo `workItemList` **e** sem arestas correlacionadas vindas de outro map.
- `map_many_list_inputs`: map com mais de uma aresta `workItemList` entrando, ou com lista e arestas correlacionadas de maps diferentes ao mesmo tempo.
- `loop_condition_unknown_port` (warning): `until.path` começa com nome de nó/porta que não existe no loop.
- `unknown_tool_profile` / `unknown_credential`: ids não estão no contexto (só quando o contexto informa a lista).
- `duplicate_id`: ids repetidos entre nós, arestas e grupos.
- `empty_prompt`: nó `agent` com prompt vazio.

### Passo a passo
1. Implemente as consultas com testes.
2. Implemente cada regra como função pequena; `validateFlowGraph` concatena e ordena (erros primeiro).
3. Use as fábricas de #{FLW-01} e variações quebradas nos testes.

## Critérios de aceite
- [ ] `buildCanonicalFlow()` e `buildLoopFlow()` não têm erros.
- [ ] Cada regra tem pelo menos um teste que a dispara, com o alvo correto.
- [ ] Ciclo dentro de loop é aceito; o mesmo ciclo fora é `cycle_outside_loop`.
- [ ] `topologicalOrder` é determinística (desempate por id).
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `graph_queries.test.ts`: vizinhos, membros, grupos envolventes, bordas, ordem topológica.
- `graph_validation.test.ts`: uma descrição por regra.
