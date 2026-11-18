---
key: UX-08
title: "Agente: Formato da resposta visual e Inserir dado no prompt"
type: issue
milestone: "Fase 12 — Experiência de criação de fluxos"
labels: [tipo:feature, area:editor]
depends_on: [UX-07]
---

## Contexto

Atende RF-EDT-04 e RF-EDT-11 (épico #185). O `outputSchema` do Agente é o que permite que uma Decisão leia
`approved`, mas hoje ele é editado como JSON Schema cru (`src/web/canvas/inspector/output_schema_editor.tsx`), algo que
um leigo não escreve. O prompt aceita variáveis, mas o usuário precisa adivinhar os nomes (há autocomplete por texto em
`prompt_completion.ts`). Com o `DataPicker` de #{UX-07}, dá para resolver as duas coisas.

## Objetivo

O usuário define o "Formato da resposta" do Agente como uma lista de campos (nome, tipo, descrição, obrigatório,
opções fixas), sem ver JSON, e insere variáveis no prompt escolhendo-as no `DataPicker`.

## Escopo

**Inclui:** editor visual de formato com aba "JSON" para avançados; conversão nos dois sentidos; botão "Inserir dado" no
prompt; aviso quando o Agente alimenta uma Decisão sem formato; textos que explicam iterações, turnos e retentativas
(no `FieldDoc` de #{UX-01}, ajustando se preciso).
**Não inclui:** mudanças no runtime de saída estruturada (`src/integrations/agent_runtime/output_schema.ts` continua
recebendo JSON Schema).

## Especificação técnica

### Arquivos

Criar:

- `src/web/canvas/inspector/response_format.ts` (conversão `ResponseField[]` ⇄ JSON Schema)
- `src/web/canvas/inspector/response_format.test.ts`
- `src/web/canvas/inspector/response_format_editor.tsx`
- `src/web/canvas/inspector/insert_data_button.tsx`

Alterar:

- `src/web/canvas/inspector/output_schema_editor.tsx` (vira a aba "JSON" do novo editor)
- `src/web/canvas/inspector/agent_inspector.tsx` (seção "Formato da resposta" com o editor visual; "Inserir dado" na
  barra do prompt)
- `src/web/canvas/inspector/prompt_editor.tsx` (expõe `insertAtCursor(text)`)
- `src/engine/validation_rules/agent_rules.ts` (aviso `agent_without_response_format` quando uma Decisão ou um `until`
  lê `nodes.<este>.result.*` e o Agente não tem `outputSchema`)
- `src/web/docs/node_docs/agent_doc.ts` (texto do campo e exemplo "Reviewer que devolve aprovado + notas")
- `src/web/canvas/inspector/agent_inspector.test.tsx`

### Contratos

```ts
export type ResponseFieldType = "boolean" | "number" | "string" | "list" | "choice";
export interface ResponseField {
    name: string; // /^[a-zA-Z_][a-zA-Z0-9_]*$/
    type: ResponseFieldType;
    description?: string;
    required: boolean;
    choices?: string[]; // só "choice": vira { type: "string", enum }
    itemType?: "string" | "number"; // só "list"
}
export function toJsonSchema(fields: ResponseField[]): JsonSchema; // { type: "object", properties, required }
export function fromJsonSchema(schema: JsonSchema): ResponseField[] | undefined; // undefined = não cabe no editor visual
```

### Regras

- Um schema que não cabe no editor visual (aninhado, `oneOf`, etc.) abre direto na aba JSON, com o aviso "Este formato
  é avançado demais para o editor visual".
- Os presets "Aprovação" (`approved: sim/não`, `notes: texto`) e "Pronto?" (`ready: sim/não`) são botões que preenchem
  os campos.
- "Inserir dado" abre o `DataPicker` (`scope: "node"`) e insere `{{<path>}}` na posição do cursor.

### Notas de design

- Cada campo do formato é uma linha: nome (mono), select de tipo com rótulos humanos ("sim/não", "número", "texto",
  "lista", "uma das opções"), checkbox "obrigatório", botão de descrição e botão de remover.
- A frase de ajuda acima da lista: "Diga o que o agente deve devolver. Esses campos aparecem para as Decisões
  seguintes."

## Critérios de aceite

- [ ] Criar `approved` (sim/não, obrigatório) e `notes` (texto) gera
      `{type:"object",properties:{approved:{type:"boolean"},notes:{type:"string"}},required:["approved"]}`.
- [ ] Abrir o Reviewer do template padrão mostra esses dois campos no editor visual.
- [ ] "uma das opções" com `bug, feature` gera `enum`, e a Decisão seguinte mostra as opções (#{UX-07}).
- [ ] Um schema aninhado abre na aba JSON com o aviso.
- [ ] "Inserir dado" insere `{{nodes.tl.summary}}` no cursor.
- [ ] Uma Decisão lendo `nodes.dev.result.x` com o Dev sem formato gera o aviso `agent_without_response_format`.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `response_format.test.ts`: ida e volta para cada tipo; schema não suportado → `undefined`.
- `agent_inspector.test.tsx`: editar campos, presets, aba JSON e Inserir dado.
- Teste de `agent_rules`: o aviso novo.
