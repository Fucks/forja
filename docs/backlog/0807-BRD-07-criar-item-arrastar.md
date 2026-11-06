---
key: BRD-07
title: "Criar item local e soltar card em coluna-gatilho"
type: issue
milestone: "Fase 8 — Board e itens"
labels: [tipo:feature, area:board]
depends_on: [BRD-06, TRG-01]
---

## Contexto

Atende RF-BRD-02 e RF-BRD-04. Itens locais permitem usar a Forja sem GitHub. Soltar um card do Backlog na primeira coluna
de estágio (ou em qualquer coluna marcada como gatilho) inicia o fluxo padrão para aquele item — o gatilho
`board_column` de #{TRG-01}.

## Objetivo

O usuário cria itens locais no board e arrasta cards do Backlog para a coluna-gatilho, iniciando uma run para o item; mover
para "Concluído"/"Precisa de humano" define a coluna manual.

## Escopo

**Inclui:** diálogo de novo item, arrastar e soltar entre colunas permitidas, confirmação de início de run, regras de destino.
**Não inclui:** reordenar cards dentro da coluna.

## Especificação técnica

### Arquivos

Criar:

- `src/web/board/new_item_dialog.tsx`
- `src/web/board/board_dnd.tsx`
- `src/web/board/drop_rules.ts`
- `src/web/board/drop_rules.test.ts`
- `src/web/board/board_dnd.test.tsx`
  Alterar:
- `src/web/board/board_view.tsx`

### Contratos

```ts
export type DropAction =
    | { kind: "start_run"; triggerId: string }
    | { kind: "set_manual_column"; column: "backlog" | "needs_human" | "done" }
    | { kind: "not_allowed"; reason: string };
export function decideDrop(
    card: BoardView["cards"][number],
    target: BoardColumnDef,
    boardTriggers: { triggerId: string; columnId: string }[],
): DropAction;
// estágio sem gatilho → not_allowed "Esta etapa é movida pela execução"; card rodando → not_allowed; bloqueado → not_allowed "Item bloqueado por #12"
```

Gatilhos de coluna vêm de `GET /api/projects/:projectId/triggers?kind=board_column` (#{TRG-01}). `start_run` →
`POST /api/triggers/:id/fire` com `{ itemIds: [id] }`.

### Passo a passo

1. `decideDrop` puro com testes.
2. DnD com `@dnd-kit` (teclado incluso: espaço para pegar, setas, espaço para soltar).
3. Confirmação "Iniciar 'Fábrica básica' para #42?" antes de `start_run`.
4. Diálogo de novo item (título, descrição, labels, bloqueado por).

### Notas de design

Durante o arraste, colunas proibidas ficam opacas e a permitida destaca a borda em `--color-accent`. Coluna-gatilho mostra
o ícone `Zap` no cabeçalho.

## Critérios de aceite

- [ ] Criar item local o coloca no Backlog.
- [ ] Soltar no estágio com gatilho pede confirmação e inicia a run para o item.
- [ ] Soltar num estágio sem gatilho é recusado com o motivo.
- [ ] Mover para "Concluído" grava a coluna manual.
- [ ] Arrastar funciona por teclado.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `drop_rules.test.ts`; `board_dnd.test.tsx` (API mockada, teclado).
