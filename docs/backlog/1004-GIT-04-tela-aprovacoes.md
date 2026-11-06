---
key: GIT-04
title: "Tela de aprovações com diff e artefatos"
type: issue
milestone: "Fase 10 — Git, gates e PR"
labels: [tipo:feature, area:git]
depends_on: [GIT-03, OBS-05, TRG-04]
---

## Contexto

Atende RF-RUN-05. A persona "revisor de PRs" quer decidir rápido com evidência: ver a mensagem do gate, o diff do branch, os
artefatos (spec, resumo do Reviewer) e os logs, e aprovar ou rejeitar com comentário. Pedidos pendentes também aparecem no
canvas da run (nó gate em "Aguardando aprovação") e no topo da app.

## Objetivo

Em `/projects/:projectId/approvals` o usuário vê os pedidos pendentes e resolvidos, abre um pedido com diff e artefatos e
resolve; a topbar mostra o número de pendentes.

## Escopo

**Inclui:** página, visualizador de diff (unificado, com arquivos recolhíveis), ações, contador na topbar, atalho do drawer do NodeRun do gate para o pedido.
**Não inclui:** comentários linha a linha.

## Especificação técnica

### Arquivos

Criar:

- `src/web/app/approvals/use_approvals.ts`
- `src/web/app/approvals/diff_viewer.tsx`
- `src/web/app/approvals/parse_unified_diff.ts`
- `src/web/app/approvals/parse_unified_diff.test.ts`
- `src/web/app/approvals/approval_detail.tsx`
- `src/web/app/approvals/approvals_page.test.tsx`
  Alterar:
- `src/web/app/approvals/approvals_page.tsx` (substituir o placeholder)
- `src/web/app/topbar.tsx` (contador de pendentes do projeto ativo)
- `src/web/canvas/live/node_run_detail.tsx` (gate: botão "Abrir aprovação")

### Contratos

```ts
export interface DiffFile {
    path: string;
    additions: number;
    deletions: number;
    hunks: { header: string; lines: { kind: "add" | "del" | "ctx"; text: string }[] }[];
}
export function parseUnifiedDiff(diff: string): { stat?: string; files: DiffFile[] };
```

### Passo a passo

1. Parser de diff puro com testes (inclui arquivos binários e renomeados).
2. Página: lista à esquerda (pendentes primeiro, com item e há quanto tempo), detalhe à direita (mensagem, item, diff recolhível por arquivo, artefatos com `JsonView`, link para logs), botões "Aprovar" e "Rejeitar" com comentário (obrigatório para rejeitar).
3. Atualização ao vivo com `approval.*`.
4. Contador na topbar.

### Notas de design

Diff em JetBrains Mono 12 px; adições em verde de `--status-succeeded` a 15% de opacidade de fundo, remoções em vermelho de
`--status-failed` a 15%. Pedido pendente com `StatusBadge` "Aguardando aprovação".

## Critérios de aceite

- [ ] A lista mostra pendentes e o contador da topbar bate.
- [ ] O diff aparece por arquivo com adições/remoções.
- [ ] Rejeitar exige comentário; aprovar não.
- [ ] Após resolver, o canvas da run mostra o gate concluído e o fluxo segue.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `parse_unified_diff.test.ts`; `approvals_page.test.tsx` (API mockada).
