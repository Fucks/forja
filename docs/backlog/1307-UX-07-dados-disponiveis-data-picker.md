---
key: UX-07
title: "Modelo de dados disponíveis e seletor de dados (DataPicker)"
type: issue
milestone: "Fase 12 — Experiência de criação de fluxos"
labels: [tipo:feature, area:editor]
depends_on: [UX-06, UX-05]
---

## Contexto

Atende RF-EDT-11 (épico #185). Com o `DataContext` de #{UX-06}, todo caminho de dado tem o mesmo formato, mas o usuário
ainda precisa **saber** que `nodes.reviewer.result.approved` existe e que é um sim/não. O agente declara isso em
`outputSchema`, e os nós determinísticos têm formatos fixos, mas nada disso chega à tela: hoje há só um `<datalist>`
de strings em `condition_editor.tsx`. Esta issue cria o modelo tipado do que está disponível em cada nó e o seletor
que Decisão (#{UX-09}), Agente (#{UX-08}), Comando (#{UX-11}), Git e Loop (#{UX-13}) vão usar.

## Objetivo

Existe `describeAvailableData(graph, nodeId, options)`, função pura que devolve os campos disponíveis com caminho,
rótulo, tipo, valores de enum, descrição e nó de origem, e existe o `DataPicker`, uma árvore pesquisável desses
campos, com amostra do último run quando houver.

## Escopo

**Inclui:** formatos fixos das saídas dos nós determinísticos; `describeAvailableData`; `DataPicker`; troca do
`<datalist>` da Decisão e do `until` do Loop pelo `DataPicker` (o editor de regra continua o mesmo até #{UX-09}).
**Não inclui:** operadores por tipo (#{UX-09}); "Inserir dado" no prompt (#{UX-08}).

## Especificação técnica

### Arquivos

Criar:

- `src/shared/node_output_shapes.ts` (formatos fixos, como JSON Schema, das saídas de `git.result` (`prUrl`, `branch`,
  …; confira o que `git_executor.ts` devolve hoje), `source.items` e `trigger.items` (lista de item) e `script.result`
  (`exitCode`, `stdoutTail`; #{UX-10} amplia); o formato do item vem de `WorkItemSnapshot`)
- `src/engine/available_data.ts`
- `src/engine/available_data.test.ts`
- `src/web/canvas/inspector/data_picker.tsx`
- `src/web/canvas/inspector/data_picker.test.tsx`
- `src/web/canvas/inspector/use_available_data.ts` (memoiza `describeAvailableData` e junta a amostra do último run de
  `use_last_node_run_sample.ts` de #{UX-05})

Alterar:

- `src/web/canvas/inspector/condition_rule_row.tsx` (o campo de caminho vira `DataPicker`; digitar à mão continua
  permitido)
- `src/web/canvas/inspector/condition_editor.tsx` (recebe `fields: DataField[]` no lugar de `suggestions: string[]`)
- `src/web/canvas/inspector/condition_inspector.tsx` e `loop_fields.tsx` (passam `fields`)
- `src/web/canvas/inspector/condition_suggestions.ts` (removido; os usos passam para `describeAvailableData`)

### Contratos

```ts
// src/engine/available_data.ts
export type DataType = "boolean" | "number" | "string" | "list" | "object" | "any";

export interface DataField {
    path: string;              // "nodes.reviewer.result.approved"
    label: string;             // "Reviewer › Resultado › approved"
    type: DataType;
    enumValues?: (string | number)[];
    description?: string;      // do JSON Schema (description) ou do PortDoc
    sourceNodeId?: string;
    depth: number;             // para indentar a árvore
}

export interface AvailableDataOptions {
    scope: "node" | "loopUntil";  // loopUntil: só nodes.* dos nós dentro do grupo
    groupId?: string;
    portLabels: (nodeType: NodeType, port: Port) => string; // injeta os rótulos do catálogo (web)
}

export function describeAvailableData(
    graph: FlowGraph,
    nodeId: string,
    options: AvailableDataOptions,
): DataField[];
```

### Regras de `describeAvailableData`

1. `item.*`: os campos de `DataContext.item`, quando o nó é por item.
2. `inputs.<porta>`: uma entrada por porta de entrada do próprio nó, com o formato da porta de origem ligada (se houver).
3. `nodes.<slug>.<porta>` de cada nó em `listUpstreamNodes` (do mais próximo para o mais distante). Para a porta, o
   formato vem de: `outputSchema` do Agente para `result` (desce em `properties` até 4 níveis, com `enum` →
   `enumValues` e `description`); `node_output_shapes.ts` para os determinísticos; o `schema` da porta, se houver;
   `text` → `string`; `json` sem schema → `object`, sem filhos.
4. `project.baseBranch`, `project.name`, `run.iteration`, `run.attempt`.
5. Mapeamento de tipos: JSON Schema `boolean` → `boolean`; `number`/`integer` → `number`; `string` → `string`; `array`
   → `list`; `object` → `object`; demais → `any`.

### Notas de design (DataPicker)

- Botão com o rótulo do campo escolhido (ou "Escolher dado…"), que abre um popover com busca no topo e uma árvore
  agrupada por origem: "Item atual", "Entradas deste nó", "Reviewer", "TL"…
- Cada linha mostra o ícone do tipo, o rótulo, o tipo por extenso ("sim/não", "número", "texto", "lista", "opções:
  a | b") e, se houver, a amostra do último run em mono truncada a 40 caracteres.
- "Digitar caminho" no rodapé alterna para um campo de texto mono. Um caminho que não está na lista mostra o aviso
  "Este caminho não aparece nos formatos conhecidos; ele só funciona se o dado existir na execução".
- Teclado: setas navegam, Enter escolhe, Esc fecha; `role="tree"` e `aria-expanded` nos grupos.
- Vazio: "Nenhum dado disponível: ligue este nó a outro ou coloque-o dentro de um Map".

## Critérios de aceite

- [ ] No fluxo padrão com uma Decisão depois do Reviewer, a lista mostra `Reviewer › Resultado › approved (sim/não)` e
      `Reviewer › Resultado › notes (texto)`.
- [ ] Um campo com `enum: ["bug","feature"]` no schema aparece com `enumValues`.
- [ ] No `until` de um Loop, só aparecem os nós de dentro do grupo.
- [ ] Nós posteriores e o próprio nó nunca aparecem.
- [ ] Escolher um campo grava o `path` exato na regra.
- [ ] Com run anterior, a amostra aparece; sem run, a lista funciona igual.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `available_data.test.ts`: as cinco regras; schema aninhado; enum; `json` sem schema; dentro e fora de Map;
  `loopUntil`.
- `data_picker.test.tsx`: busca, teclado, digitar caminho e aviso de caminho desconhecido.
- `condition_editor.test.tsx`: escolher um campo atualiza a condição.
