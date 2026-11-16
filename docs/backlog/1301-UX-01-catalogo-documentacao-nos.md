---
key: UX-01
title: "Catálogo tipado de documentação dos nós e grupos"
type: issue
milestone: "Fase 12 — Experiência de criação de fluxos"
labels: [tipo:feature, area:editor, documentation]
depends_on: []
---

## Contexto

Atende RF-EDT-10 do épico #185. Hoje a única explicação de um nó é uma frase em
`src/web/canvas/palette/palette_items.ts` ("Desvia por uma regra sobre os dados"), e o rótulo vem de
`src/web/canvas/base/node_type_labels.ts`. Um usuário leigo não descobre o que cada caixa faz, o que entra, o que sai,
nem o que significa cada campo. Esta issue cria a **fonte única** de documentação que a paleta (#{UX-03}), as portas
(#{UX-04}), o inspector (#{UX-05}) e o guia no app (#{UX-02}) vão ler. Um teste impede que um campo novo de config
nasça sem documentação.

## Objetivo

Existe `NODE_DOCS`, com uma entrada documentada para cada `NodeType` e para os grupos `map` e `loop`, e um teste de
completude que falha quando falta documentação para uma chave de config, porta padrão ou valor de enum.

## Escopo

**Inclui:** tipos `NodeDoc`/`PortDoc`/`FieldDoc`/`NodeExample`; conteúdo dos 10 documentos; `getNodeDoc`;
`NODE_TYPE_LABELS` e `PALETTE_ITEMS` passando a derivar do catálogo; teste de completude.
**Não inclui:** exibir a documentação em novas telas (#{UX-02}, #{UX-03}, #{UX-04}, #{UX-05}). Os campos novos do
Comando (#{UX-10}) e da Decisão em vários caminhos (#{UX-12}) são documentados nas próprias issues; o teste de
completude obriga isso.

## Especificação técnica

### Arquivos

Criar:

- `src/web/docs/node_docs/node_doc.ts` (tipos)
- `src/web/docs/node_docs/trigger_doc.ts`, `source_doc.ts`, `agent_doc.ts`, `script_doc.ts`, `condition_doc.ts`,
  `gate_doc.ts`, `git_doc.ts`, `output_doc.ts`, `map_doc.ts`, `loop_doc.ts`
- `src/web/docs/node_docs/node_docs.ts` (índice: `NODE_DOCS`, `getNodeDoc`, `NODE_CATEGORIES`)
- `src/web/docs/node_docs/node_docs.test.ts`

Alterar:

- `src/web/canvas/base/node_type_labels.ts` (`NODE_TYPE_LABELS[type] = getNodeDoc(type).title`)
- `src/web/canvas/palette/palette_items.ts` (`description` = `tagline` do catálogo)
- `src/web/canvas/palette/node_palette.test.tsx` (textos novos)

### Contratos

```ts
// src/web/docs/node_docs/node_doc.ts
import type { NodeType, PortType } from "@/shared/flow_graph.js";

export type GroupKind = "map" | "loop";
export type DocumentedType = NodeType | GroupKind;

export const NODE_CATEGORIES = [
    "inicio", "trabalho", "ia", "executar", "decidir", "humano", "entrega", "fim", "grupo",
] as const;
export type NodeCategory = (typeof NODE_CATEGORIES)[number];

export interface PortDoc {
    name: string;           // nome técnico da porta ("result")
    label: string;          // nome na tela ("Resultado estruturado")
    type: PortType | "loopExhausted";
    required: boolean;
    description: string;
}

export interface FieldOptionDoc { value: string; label: string; description: string }

export interface FieldDoc {
    key: string;            // chave da config ("maxIterations")
    label: string;          // "Repetições do prompt"
    description: string;    // 1–3 frases, sem jargão
    defaultValue?: string;  // descrito para humanos: "1 (roda uma vez)"
    options?: FieldOptionDoc[];
    advanced?: boolean;     // aparece recolhido em "Avançado" no inspector
}

export interface NodeExample { title: string; description: string; config?: Record<string, unknown> }

export interface NodeDoc {
    type: DocumentedType;
    title: string;          // "Decisão"
    category: NodeCategory;
    tagline: string;        // ≤ 70 caracteres
    whatItDoes: string;     // 2–4 frases
    whenToUse: string[];
    whenNotToUse?: string[];
    ports: { inputs: PortDoc[]; outputs: PortDoc[] };
    fields: FieldDoc[];
    examples: NodeExample[];
    pitfalls: string[];
    related: DocumentedType[];
}

// src/web/docs/node_docs/node_docs.ts
export const NODE_DOCS: Record<DocumentedType, NodeDoc>;
export function getNodeDoc(type: DocumentedType): NodeDoc;
export const CATEGORY_LABELS: Record<NodeCategory, string>;
// "Início", "Buscar trabalho", "IA", "Executar", "Decidir", "Humano", "Entrega", "Fim", "Grupos"
```

### Conteúdo (mínimo; escreva em português direto, frases curtas)

- **Títulos novos:** `condition` → **"Decisão"**, `script` → **"Comando"**, `gate` → **"Aprovação humana"**. Os demais
  continuam como estão: Gatilho, Fonte, Agente, Git, Saída, Map, Loop. Os tipos técnicos **não mudam**.
- O texto de cada nó está no épico #185, em "Conteúdo da documentação de cada nó": o que faz, quando usar, entradas,
  saídas, campos, exemplos e erros comuns. Copie e complete. Para Decisão e Comando, documente os campos **atuais**:
  `condition`; `command`, `timeoutMinutes` e `workspace`. #{UX-09}, #{UX-10} e #{UX-12} atualizam esses documentos.
- Nomes de porta na tela: `items` "Itens", `trigger` "Sinal de início", `item` "Item atual", `context` "Contexto
  extra", `result` "Resultado", `summary` "Resumo em texto", `value` "O que passa adiante", `true` "Sim",
  `false` "Não", `approved` "Aprovado", `rejected` "Rejeitado", `body` "Texto do PR", `exhausted` "Esgotou as voltas".
- Map: campos `concurrency`, `barrier` e `failFast`. Loop: `maxIterations`, `until` e `carry`, mais a porta especial
  `exhausted`.

### Passo a passo

1. Crie `node_doc.ts` com os tipos.
2. Escreva um arquivo por tipo, exportando `const <tipo>Doc: NodeDoc`.
3. Monte `NODE_DOCS` e `getNodeDoc` no índice.
4. Troque `NODE_TYPE_LABELS` e o `description` de `PALETTE_ITEMS` para ler do catálogo.
5. Escreva o teste de completude (abaixo) e rode-o até passar.

## Critérios de aceite

- [ ] `NODE_DOCS` tem entrada para os 8 `NODE_TYPES` e para `map` e `loop`.
- [ ] Toda chave de `<tipo>ConfigSchema.shape`, de `mapConfigSchema.shape` e de `loopConfigSchema.shape` tem um
      `FieldDoc` com o mesmo `key`.
- [ ] Toda porta de `createDefaultNode(type, ...)` tem um `PortDoc` (mesmo `name`, `type` e `required`).
- [ ] Todo valor de `SOURCE_PROVIDERS`, `GIT_ACTIONS`, `TRIGGER_KINDS`, `ITEM_DESTINATIONS`, `AGENT_WORKSPACES`,
      `EFFORTS` e `GATE_REVIEW_SECTIONS` aparece em `options` do campo correspondente.
- [ ] `tagline` tem no máximo 70 caracteres e todo doc tem pelo menos 1 exemplo e 1 erro comum.
- [ ] A paleta mostra "Decisão", "Comando" e "Aprovação humana".
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `node_docs.test.ts`: um `describe` por tipo, com as quatro verificações de completude acima (iterando `NODE_TYPES` e
  os schemas; nada de listas escritas à mão no teste) e um caso que falha de propósito com um doc incompleto montado no
  teste, para provar que a verificação pega a falta.
- `node_palette.test.tsx`: os rótulos e as descrições vêm do catálogo.
