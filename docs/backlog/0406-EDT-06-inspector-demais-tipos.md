---
key: EDT-06
title: "Inspector dos demais tipos de nó"
type: issue
milestone: "Fase 4 — Editor visual"
labels: [tipo:feature, area:editor]
depends_on: [EDT-05]
---

## Contexto
Atende RF-EDT-04. Com o painel e o registro de #{EDT-05}, faltam os formulários de trigger, source, script, condition,
gate, git e output. A condição usa o formato declarativo de `src/shared/conditions.ts` (#{FLW-01}) — sem código livre.

## Objetivo
Cada tipo de nó tem um inspector que edita sua config conforme o schema de #{FLW-01}, incluindo um editor visual de
condições usado também pelo grupo loop (#{EDT-07}).

## Escopo
**Inclui:** sete inspectors, `ConditionEditor` reutilizável, registro completo.
**Não inclui:** configurar o gatilho em si (cron, evento) — isso vive em Trigger (#{TRG-04}); o inspector do trigger
mostra o tipo e um link para a tela de gatilhos.

## Especificação técnica
### Arquivos
Criar:
- `src/web/canvas/inspector/trigger_inspector.tsx`
- `src/web/canvas/inspector/source_inspector.tsx`
- `src/web/canvas/inspector/script_inspector.tsx`
- `src/web/canvas/inspector/condition_inspector.tsx`
- `src/web/canvas/inspector/gate_inspector.tsx`
- `src/web/canvas/inspector/git_inspector.tsx`
- `src/web/canvas/inspector/output_inspector.tsx`
- `src/web/canvas/inspector/condition_editor.tsx`
- `src/web/canvas/inspector/condition_text.ts`
- `src/web/canvas/inspector/condition_text.test.ts`
- `src/web/canvas/inspector/other_inspectors.test.tsx`
Alterar:
- `src/web/canvas/inspector/inspector_registry.ts`

### Contratos
```ts
export function conditionToText(c: Condition): string; // "review.approved = true E tests.exitCode = 0"
export function ConditionEditor(props: { value: Condition; onChange(c: Condition): void; suggestions: string[] /* paths conhecidos */ }): JSX.Element;
```
Campos por tipo:
- source: provedor (GitHub/local), label, limite (1–100), "pular issues bloqueadas".
- script: comando (Input mono; dica "roda dentro do container do item"), timeout.
- condition: `ConditionEditor`.
- gate: mensagem, o que mostrar (diff/artefatos/logs), timeout em horas (opcional).
- git: ação (rebase/push/abrir PR), branch base (placeholder = do projeto), rascunho, corpo do PR a partir de qual porta.
- output: mover item para (concluído / precisa de humano), comentar na issue.
- trigger: tipo (somente leitura) + link "Configurar gatilhos".
`ConditionEditor`: linhas "caminho · operador · valor" com "E/OU" no topo; `suggestions` vindas das saídas dos nós a montante (`<rótulo-slug>.<porta>`).

### Passo a passo
1. `conditionToText` puro.
2. Inspectors com `Field` + componentes de #{DS-02}.
3. Registrar todos no registro.

## Critérios de aceite
- [ ] Cada tipo tem inspector e as mudanças vão para o rascunho.
- [ ] `ConditionEditor` monta `and` de duas regras e o resumo do nó condition mostra o texto.
- [ ] Limites do schema (ex.: limite do source 0 ou 101) são impedidos no formulário.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `condition_text.test.ts`: cada operador e aninhamento.
- `other_inspectors.test.tsx`: um caso de edição por tipo.
