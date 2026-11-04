---
key: FLW-05
title: "Exportar e importar fluxo em YAML"
type: issue
milestone: "Fase 3 — Modelo de fluxo"
labels: [tipo:feature, area:fluxo]
depends_on: [FLW-04]
---

## Contexto
Atende RF-EDT-09 e RNF-POR-02. Fluxos exportáveis em arquivo legível permitem versionar a linha de montagem no próprio
repositório do projeto, revisar mudanças em PR e não prender o usuário à Forja (lição dos concorrentes abandonados no
benchmark). O YAML precisa ter ordem determinística para gerar diffs limpos.

## Objetivo
Existem `flowToYaml` e `yamlToFlow` (ida e volta sem perda), e as rotas para exportar uma versão ou o rascunho e
importar um YAML como novo fluxo.

## Escopo
**Inclui:** serialização determinística, cabeçalho com metadados, importação com validação, rotas.
**Não inclui:** UI de importar/exportar (#{EDT-11}).

## Especificação técnica
### Arquivos
Criar:
- `src/server/flows/flow_yaml.ts`
- `src/server/flows/flow_yaml.test.ts`
Alterar:
- `src/server/flows/flows_routes.ts`

### Contratos
```ts
export interface FlowFile { forja: 1; name: string; exportedAt: string; graph: FlowGraph }
export function flowToYaml(file: FlowFile): string;
export function yamlToFlow(text: string): FlowFile; // lança FlowFileError com linha/coluna quando possível
```
Ordem determinística: chaves na ordem `forja, name, exportedAt, graph`; dentro do grafo `schemaVersion, nodes, groups, edges`;
nós e grupos ordenados por `id`; arestas por `from.nodeId, from.port, to.nodeId, to.port`; dentro de cada nó
`id, type, label, parentGroupId, position, inputs, outputs, config`. Prompts multilinha como bloco literal `|`.
Posições arredondadas para inteiros.
Rotas: `GET /api/flows/:flowId/export?version=<n|draft>` (`content-type: application/yaml`, `content-disposition`
com `<slug>.forja.yaml`) e `POST /api/projects/:projectId/flows/import` (corpo texto YAML) → cria fluxo com rascunho = grafo importado.

### Passo a passo
1. Normalizador puro que ordena e arredonda; depois `yaml.stringify` com `lineWidth: 0` e blocos literais para strings com `\n`.
2. `yamlToFlow`: parse + `parseFlowGraph`; `forja` diferente de 1 → erro claro.
3. Rotas.

## Critérios de aceite
- [ ] `yamlToFlow(flowToYaml(f))` reproduz o grafo (após normalização) para as duas fábricas de #{FLW-01}.
- [ ] Exportar duas vezes o mesmo grafo com nós em ordem diferente gera texto idêntico.
- [ ] Prompts multilinha saem como bloco `|` legível.
- [ ] YAML inválido devolve 422 com a posição do erro.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `flow_yaml.test.ts`: ida e volta, determinismo, prompt multilinha, versão desconhecida, YAML quebrado.
