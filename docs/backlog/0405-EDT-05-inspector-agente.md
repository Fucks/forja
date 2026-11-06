---
key: EDT-05
title: "Inspector do nó agente: prompt, modelo, effort e ferramentas"
type: issue
milestone: "Fase 4 — Editor visual"
labels: [tipo:feature, area:editor]
depends_on: [EDT-04, FLW-03, CFG-04, CFG-05]
---

## Contexto

Atende RF-EDT-04 — o pedido central do usuário: editar no próprio canvas o prompt, o modelo e o effort de cada nó.
O inspector mostra a config do nó selecionado. O prompt é editado num CodeMirror com realce e autocomplete das
variáveis disponíveis (`availableVariables` de #{FLW-03}); modelo, effort e perfil herdam do projeto (#{CFG-05})
quando não definidos.

## Objetivo

Ao selecionar um nó agente, o painel à direita permite editar rótulo, prompt, modelo, effort, perfil de ferramentas,
credencial, workspace, iterações, timeouts, retentativas, schema de saída e portas de entrada extras, com mudanças
aplicadas ao rascunho.

## Escopo

**Inclui:** painel do inspector, registro de inspectors por tipo (só o agente aqui), editor de prompt com CodeMirror,
editor de schema de saída (JSON com validação), portas extras.
**Não inclui:** inspectors dos outros tipos (#{EDT-06}), testar o nó isolado (Pós-MVP).

## Especificação técnica

### Arquivos

Criar:

- `src/web/canvas/inspector/inspector_panel.tsx`
- `src/web/canvas/inspector/inspector_registry.ts`
- `src/web/canvas/inspector/agent_inspector.tsx`
- `src/web/canvas/inspector/prompt_editor.tsx`
- `src/web/canvas/inspector/prompt_completion.ts`
- `src/web/canvas/inspector/output_schema_editor.tsx`
- `src/web/canvas/inspector/port_list_editor.tsx`
- `src/web/canvas/inspector/node_updates.ts`
- `src/web/canvas/inspector/node_updates.test.ts`
- `src/web/canvas/inspector/prompt_completion.test.ts`
- `src/web/canvas/inspector/agent_inspector.test.tsx`
  Alterar:
- `src/web/app/flows/flow_editor_page.tsx` (montar o inspector à direita)

### Contratos

```ts
export type InspectorComponent = (props: {
    node: FlowNode;
    graph: FlowGraph;
    onChange(update: (n: FlowNode) => FlowNode): void;
}) => JSX.Element;
export const inspectorRegistry: Partial<Record<NodeType, InspectorComponent>>; // #{EDT-06} completa
export function updateNodeConfig<T extends NodeType>(
    graph: FlowGraph,
    nodeId: string,
    update: (n: FlowNode) => FlowNode,
): FlowGraph;
export function addInputPort(graph: FlowGraph, nodeId: string, port: Port): FlowGraph; // só agent; nome único
export function removeInputPort(graph: FlowGraph, nodeId: string, name: string): FlowGraph; // remove arestas ligadas
export function promptCompletions(
    vars: VariableInfo[],
    textBeforeCursor: string,
): { from: number; options: { label: string; detail: string }[] } | null; // ativa após "{{"
```

Modelos sugeridos (Select editável): `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5-1` e
"padrão do projeto". Effort: SegmentedControl `low | medium | high | xhigh | max` + "padrão". Perfil e credencial:
Select com os itens das APIs de #{CFG-04} e #{CFG-02}.

### Passo a passo

1. Funções puras de atualização e de autocomplete com testes.
2. `InspectorPanel` lê a seleção do store; com zero ou vários selecionados mostra o resumo do fluxo; com um nó usa o registro.
3. `PromptEditor` (CodeMirror, Markdown, JetBrains Mono): realça `{{...}}` (verde se a variável existe, vermelho se não),
   autocompleta após `{{`, altura redimensionável e botão "tela cheia" (Dialog grande).
4. `OutputSchemaEditor`: textarea mono com JSON; erro de parse inline; botão "exemplo" com `{ "type": "object", "properties": { "approved": { "type": "boolean" } } }`.
5. `PortListEditor` para portas de entrada extras (nome, tipo, obrigatória).
6. Campos numéricos com limites do schema de #{FLW-01}; valores herdados como placeholder.

### Notas de design

Inspector 360 px, seções recolhíveis: "Prompt" (aberta), "Modelo e esforço", "Ferramentas e credencial", "Execução"
(workspace, iterações, timeouts, retentativas), "Saída", "Portas". Mudanças aplicam ao soltar o campo (não a cada tecla
no prompt: debounce 300 ms).

## Critérios de aceite

- [ ] Selecionar um agente abre o inspector com os valores atuais; editar o prompt atualiza o rascunho (autosave).
- [ ] Digitar `{{` sugere as variáveis disponíveis para aquele nó; variável inexistente fica destacada em vermelho.
- [ ] Escolher "padrão" em modelo/effort remove o valor do nó e o resumo do nó passa a mostrar "padrão".
- [ ] Schema de saída com JSON inválido mostra o erro e não é aplicado.
- [ ] Adicionar porta `spec: text` cria a porta no nó; remover a porta remove a aresta ligada.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `node_updates.test.ts`: atualizar config, portas únicas, remoção em cascata.
- `prompt_completion.test.ts`: ativa após `{{`, filtra por prefixo, não ativa fora.
- `agent_inspector.test.tsx`: editar effort e modelo; JSON inválido.
