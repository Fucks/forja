---
key: UX-12
title: "Decisão com vários caminhos (switch com Senão)"
type: issue
milestone: "Fase 12 — Experiência de criação de fluxos"
labels: [tipo:feature, area:editor, area:motor]
depends_on: [UX-11]
---

## Contexto

Atende RF-EDT-12 (épico #185). Depois de #{UX-09}, a Decisão tem Sim/Não com operadores tipados, mas casos como "Reviewer
diz: aprovado / precisa de ajustes / precisa de humano" ou "triagem: bug / feature / dúvida" viram uma cadeia de
Decisões difícil de ler. Dify (IF/ELIF/ELSE) e n8n (Switch) resolvem isso com um nó de vários ramos.

## Objetivo

A Decisão tem o modo "Vários caminhos": ramos ordenados, cada um com nome e regras, mais _Senão_ opcional. O item segue
pelo **primeiro ramo verdadeiro**, e as portas de saída derivam dos ramos.

## Escopo

**Inclui:** schema com `mode`; executor; validação; portas derivadas; editor com a alternância _Sim/Não | Vários
caminhos_; documentação.
**Não inclui:** enviar o item para mais de um ramo ao mesmo tempo (fan-out); a Decisão continua escolhendo um ramo só.

## Especificação técnica

### Arquivos

Criar:

- `src/shared/node_configs/condition_branches.ts` (`branchPortsOf(config): Port[]`)
- `src/web/canvas/inspector/condition_branches_editor.tsx`
- `src/web/canvas/inspector/condition_branches_editor.test.tsx`

Alterar:

- `src/shared/node_configs/condition_config.ts`
- `src/shared/node_defaults.ts` (Decisão nova continua `mode: "if"`)
- `src/server/runtime/executors/condition_executor.ts`
- `src/engine/validation_rules/` (as regras novas ficam no arquivo da regra de Decisão criado em #{UX-09})
- `src/web/canvas/inspector/condition_inspector.tsx` (alternância de modo)
- `src/web/canvas/edge_actions.ts` ou o ponto que sincroniza portas e arestas (renomear ou remover um ramo atualiza ou
  remove as arestas dele, num único passo de histórico)
- `src/web/canvas/nodes/node_summary.ts` ("3 caminhos: Aprovado · Ajustes · Humano · Senão")
- `src/web/docs/node_docs/condition_doc.ts` e `docs/nos/condition.md`
- `src/shared/conditions.test.ts` ou `deterministic_executors.test.ts`

### Contratos

```ts
const branchSchema = z.object({
    port: z.string().regex(PORT_NAME_PATTERN), // "approved", "changes"
    label: z.string().min(1).max(40), // "Aprovado"
    condition: conditionSchema,
});

export const conditionConfigSchema = z.preprocess(
    // v2 sem `mode` (todas as Decisões até aqui) = "if"
    (raw) => (isObject(raw) && !("mode" in raw) ? { ...raw, mode: "if" } : raw),
    z.discriminatedUnion("mode", [
        z.object({ mode: z.literal("if"), condition: conditionSchema }),
        z.object({
            mode: z.literal("switch"),
            branches: z.array(branchSchema).min(1).max(10),
            otherwise: z.boolean().default(true),
        }),
    ]),
);
export const OTHERWISE_PORT = "otherwise";
```

### Semântica

- `if`: igual a hoje (portas `true`/`false`).
- `switch`: avalia os ramos em ordem, e o primeiro verdadeiro recebe `inputs.value` na porta `port`. Se nenhum for
  verdadeiro e `otherwise` for true, o valor vai para a porta `otherwise`. Se `otherwise` for false, o NodeRun termina
  SUCCEEDED **sem saída**: os ramos são pulados, e o item é marcado "Precisa de humano" pelo artefato `item_outcome`
  com `{ moveItemTo: "needs_human", reason: "Nenhum caminho da Decisão <label> se aplicou" }`. Reutilize
  `ITEM_OUTCOME_ARTIFACT` de `output_executor.ts`.
- As `outputs` do nó são sempre `branchPortsOf(config)`: o editor reescreve `node.outputs` quando os ramos mudam.
- Trocar de `if` para `switch` converte a regra atual no primeiro ramo ("Sim") e cria _Senão_. Trocar de volta usa o
  primeiro ramo como condição e avisa que os demais serão removidos (confirmação inline).
- Validação: `port` únicos, sem `otherwise` nem `true`/`false` em `switch`; aresta saindo de porta inexistente é erro;
  ramo com regra vazia é erro.

### Notas de design

- Cada ramo é um cartão com nome editável, as regras (o mesmo editor de #{UX-09}) e botões de subir, descer e remover.
  _Senão_ fica fixo no fim, com um switch para desligar.
- No canvas, as portas aparecem na ordem dos ramos, com os labels dos ramos.

## Critérios de aceite

- [ ] Com os ramos Aprovado (`approved` verdadeiro) e Ajustes (`notes` não vazio) e um resultado `{approved:false,notes:"x"}`,
      o item segue por Ajustes.
- [ ] Quando nada casa e há _Senão_, o item segue pela porta `otherwise`.
- [ ] Quando nada casa e não há _Senão_, os ramos são pulados e o item fica "Precisa de humano" com o motivo.
- [ ] Remover um ramo remove as arestas dele num único passo de desfazer.
- [ ] As Decisões existentes (sem `mode`) continuam funcionando como `if`.
- [ ] Export e import YAML preservam os ramos.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- Executor: primeiro verdadeiro vence, _Senão_, sem match sem _Senão_.
- Schema: preprocess sem `mode`; limites de ramos.
- `condition_branches_editor.test.tsx`: adicionar, reordenar, remover, alternar modo.
- Validação: portas duplicadas, aresta órfã.
