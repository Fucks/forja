---
key: FLW-03
title: "Template de prompt com variáveis das portas"
type: issue
milestone: "Fase 3 — Modelo de fluxo"
labels: [tipo:feature, area:fluxo]
depends_on: [FLW-01]
---

## Contexto

Cada nó de agente roda em contexto limpo: a única forma de passar informação de um nó para outro é pelas portas
(PRD, "Contexto limpo"). O prompt do nó é um template que referencia entradas (`{{inputs.spec}}`), o item
(`{{item.title}}`) e o projeto (`{{project.baseBranch}}`). Variável desconhecida precisa ser erro de validação
(não string vazia), e o editor precisa da lista de variáveis disponíveis para o autocomplete (#{EDT-05}).

## Objetivo

Existem `parsePromptTemplate`, `renderPrompt`, `availableVariables(node, graph)` e `checkPromptVariables` puros e testados.

## Escopo

**Inclui:** sintaxe `{{caminho}}`, escape `\{{`, renderização de objetos como JSON indentado, lista de variáveis por nó.
**Não inclui:** comandos de contexto `` !`cmd` `` (passam intactos pelo template; o runtime os expande, #{RT-02}).

## Especificação técnica

### Arquivos

Criar:

- `src/engine/prompt_template.ts`
- `src/engine/prompt_template.test.ts`

### Contratos

```ts
export interface TemplateToken {
    kind: "text" | "var";
    value: string;
    start: number;
    end: number;
}
export function parsePromptTemplate(template: string): TemplateToken[];

export interface PromptContext {
    inputs: Record<string, unknown>;
    item?: {
        id: string;
        title: string;
        body: string;
        number?: number;
        url?: string;
        labels: string[];
        branch?: string;
    };
    project: { name: string; baseBranch: string; githubRepo?: string };
    run: { id: string; iteration: number; attempt: number };
}
export function renderPrompt(template: string, context: PromptContext): string; // lança PromptRenderError(variável) se ausente

export interface VariableInfo {
    path: string;
    description: string;
    type: string;
}
export function availableVariables(node: FlowNode, graph: FlowGraph): VariableInfo[];
// inputs.<porta> para cada porta de entrada do nó; item.* se o nó tem porta workItem ou está dentro de map;
// project.*; run.iteration e run.attempt; dentro de loop: inputs.<carry> também.
export function checkPromptVariables(node: AgentNode, graph: FlowGraph): ValidationIssue[]; // code "unknown_variable"
```

Regras: `{{ inputs.spec }}` aceita espaços; `\{{` é literal; valores `string` entram como estão; `number`/`boolean`
via `String`; objetos/arrays como JSON com 2 espaços; `undefined` é erro; `null` vira `null`.

### Passo a passo

1. Tokenizador com posições (o editor usa `start`/`end` para destacar).
2. `renderPrompt` com resolução por caminho.
3. `availableVariables` usando só `node.inputs`, `node.parentGroupId` e `graph.groups` (sem depender de
   #{FLW-02}, que roda em paralelo).
4. `checkPromptVariables` devolve `ValidationIssue` de `src/shared/validation_issue.ts` (#{FLW-01}).

## Critérios de aceite

- [ ] `renderPrompt("Implemente {{item.title}}", ctx)` substitui; `{{item.nada}}` lança `PromptRenderError` citando a variável.
- [ ] Objetos são inseridos como JSON indentado; `\{{x}}` sai literal.
- [ ] `availableVariables` inclui `item.*` para nó dentro de map e `inputs.<carry>` dentro de loop.
- [ ] `checkPromptVariables` aponta variável inexistente com `code: "unknown_variable"`.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `prompt_template.test.ts`: tokenização com posições, escape, renderização por tipo, erros, variáveis por posição do nó.
