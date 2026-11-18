---
key: UX-09
title: "Decisão: operadores conforme o tipo, frase legível, ramos Sim/Não e pré-visualização"
type: issue
milestone: "Fase 12 — Experiência de criação de fluxos"
labels: [tipo:feature, area:editor, area:motor]
depends_on: [UX-07]
---

## Contexto

Atende RF-EDT-12 (épico #185). Depois de #{UX-06} e #{UX-07}, a Decisão lê qualquer dado anterior e o usuário escolhe
o campo numa lista tipada. Os operadores, porém, continuam genéricos (`eq`, `neq`, `gt`, `lt`, `exists` em
`src/shared/conditions.ts`), não mudam com o tipo e não cobrem casos comuns ("contém", "≥", "é um de", "está vazio").
O resumo no nó (`condition_text.ts`) usa notação técnica, e os ramos aparecem como `true`/`false`.

## Objetivo

Na Decisão, o usuário escolhe o dado, vê só os operadores que fazem sentido para o tipo, preenche o valor com o
controle certo (nada, número, texto ou opções do enum), lê a regra como frase ("Se Reviewer › approved é verdadeiro →
Sim") e testa a regra contra o último run.

## Escopo

**Inclui:** operadores novos no motor; editor de regra tipado; frase legível no editor e no resumo do nó; rótulos Sim/Não
nas portas (via catálogo); pré-visualização com o último run; validação de operador × tipo; documentação da Decisão
atualizada.
**Não inclui:** o modo "vários caminhos" (#{UX-12}); o mesmo editor no `until` do Loop ganha os operadores
automaticamente, mas o restante do inspector do Loop fica para #{UX-13}.

## Especificação técnica

### Arquivos

Criar:

- `src/web/canvas/inspector/condition_operators.ts` (`operatorsFor(type: DataType): OperatorOption[]`)
- `src/web/canvas/inspector/condition_operators.test.ts`
- `src/web/canvas/inspector/condition_value_input.tsx`
- `src/web/canvas/inspector/condition_preview.tsx`
- `src/web/canvas/inspector/evaluate_condition_preview.ts` (avalia a regra sobre um `DataContext` montado a partir da
  amostra do último run e devolve o ramo e a explicação)
- `src/web/canvas/inspector/evaluate_condition_preview.test.ts`

Alterar:

- `src/shared/conditions.ts` (operadores novos)
- `src/shared/conditions.test.ts`
- `src/web/canvas/inspector/condition_rules.ts` e `condition_rule_row.tsx` (operador e valor dependem do tipo do campo)
- `src/web/canvas/inspector/condition_text.ts` (`conditionToSentence(condition, fields): string`; o texto técnico
  continua disponível para o tooltip)
- `src/web/canvas/nodes/node_summary.ts` (Decisão usa a frase)
- `src/engine/validation_rules/` (regra nova `condition_operator_type`, no arquivo de regras de nó que já valida a
  Decisão, ou num novo `condition_rules.ts` registrado em `validation_issues.ts`)
- `src/web/docs/node_docs/condition_doc.ts` (operadores, exemplos "Reviewer aprovou?", "Testes passaram?", "Tem a
  label urgente?") e o `docs/nos/condition.md` regenerado

### Contratos

```ts
// src/shared/conditions.ts — adições (todas declarativas, sem código livre)
export type Condition =
    | { op: "eq" | "neq"; path: string; value: string | number | boolean }
    | { op: "gt" | "lt" | "gte" | "lte"; path: string; value: number }
    | { op: "contains" | "notContains" | "startsWith"; path: string; value: string }
    | { op: "in"; path: string; values: (string | number)[] }
    | { op: "isEmpty" | "isNotEmpty" | "exists"; path: string }
    | { op: "minLength"; path: string; value: number }
    | { op: "and" | "or"; conditions: Condition[] }
    | { op: "not"; condition: Condition };
```

Semântica: `contains`/`notContains` valem para texto (substring) e para lista (inclusão); `startsWith` só para texto;
`in` compara com `===`; `isEmpty` é verdadeiro para `""`, `[]`, `{}`, `null` e caminho ausente; `minLength` vale para
texto e lista. Tipo errado em tempo de execução → `false`, sem erro, como `gt` faz hoje.

### Operadores por tipo (na tela)

| Tipo            | Opções (rótulo → op)                                                                   |
| --------------- | -------------------------------------------------------------------------------------- |
| boolean         | é verdadeiro → `eq true` · é falso → `eq false`                                        |
| number          | = · ≠ · > · ≥ · < · ≤                                                                  |
| string          | é igual · é diferente · contém · não contém · começa com · está vazio · não está vazio |
| string com enum | é · não é · é um de (`in`)                                                             |
| list            | está vazia · não está vazia · contém · tem pelo menos N (`minLength`)                  |
| object / any    | existe · não existe (`not exists`)                                                     |

### Pré-visualização

"Testar com o último run" usa a amostra de `use_last_node_run_sample.ts` (#{UX-05}). A amostra precisa ter os valores
de `nodes.*`: se o NodeRun da Decisão não os guarda, monte-os a partir das amostras dos nós anteriores do mesmo item
naquele run. O resultado aparece como "Run #<n> · item #<número>: **approved = false** → **Não**". Sem run, o botão fica
desabilitado com o tooltip "Rode o fluxo uma vez para testar com dados reais".

### Notas de design

- A frase fica acima das regras, em texto normal, com os dados em negrito; a cor não é o único sinal (Sim com ícone de
  check, Não com ícone de x).
- O conectivo E/OU continua com `SegmentedControl`, agora dentro da frase: "… **e** …".
- Erro de operador × tipo aparece embaixo da regra: "‘contém’ não serve para sim/não. Escolha ‘é verdadeiro’ ou ‘é
  falso’."

## Critérios de aceite

- [ ] Escolher `approved` (sim/não) mostra só "é verdadeiro" e "é falso", sem campo de valor.
- [ ] Escolher um campo enum mostra "é um de" com multi-select das opções.
- [ ] Os operadores novos têm testes no motor, incluindo tipo errado → `false`.
- [ ] O nó Decisão mostra "Se Reviewer › approved é verdadeiro" e as portas "Sim"/"Não".
- [ ] A pré-visualização mostra o ramo certo para um run gravado no SQLite em memória (teste de integração da rota de
      amostra).
- [ ] `contains` num campo sim/não gera o erro `condition_operator_type`; num caminho de tipo desconhecido, não há erro.
- [ ] Decisões migradas de v1 (`inputs.value.*`) abrem e editam normalmente.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `conditions.test.ts`: cada operador novo, texto × lista, tipo errado, caminho ausente.
- `condition_operators.test.ts`: tabela de tipos.
- `evaluate_condition_preview.test.ts`: Sim, Não e explicação.
- `condition_editor.test.tsx`: troca de campo reseta operador e valor incompatíveis.
- `node_summary.test.ts`: frase.
