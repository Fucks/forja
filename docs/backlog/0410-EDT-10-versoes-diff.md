---
key: EDT-10
title: "Versões do fluxo: lista, diff e restaurar"
type: issue
milestone: "Fase 4 — Editor visual"
labels: [tipo:feature, area:editor]
depends_on: [EDT-09]
---

## Contexto

Atende RF-EDT-07. O TL ajusta prompts e quer saber o que mudou entre a v3 (que gerou PRs ruins) e a v4. A API de
versões existe (#{FLW-04}); falta o diff semântico (nós adicionados, removidos, configs alteradas, prompts com diff de
texto) e a tela.

## Objetivo

Em `/projects/:projectId/flows/:flowId/versions` o usuário vê as versões, compara duas (ou uma com o rascunho) com
diff semântico e restaura uma versão para o rascunho.

## Escopo

**Inclui:** `diffFlowGraphs` puro, tela de versões, diff de prompt por linhas, restaurar.
**Não inclui:** comparação de custo/qualidade entre versões (Pós-MVP).

## Especificação técnica

### Arquivos

Criar:

- `src/engine/graph_diff.ts`
- `src/engine/graph_diff.test.ts`
- `src/web/app/flows/version_diff_view.tsx`
- `src/web/app/flows/versions_page.test.tsx`
  Alterar:
- `src/web/app/flows/versions_page.tsx` (substituir o placeholder)
- `src/web/app/flows/flow_editor_page.tsx` (link "Versões" na barra)

### Contratos

```ts
export type FieldChange = { path: string; before: unknown; after: unknown };
export interface FlowGraphDiff {
    addedNodes: FlowNode[];
    removedNodes: FlowNode[];
    changedNodes: { nodeId: string; label: string; changes: FieldChange[] }[]; // ignora position
    addedEdges: FlowEdge[];
    removedEdges: FlowEdge[];
    addedGroups: FlowGroup[];
    removedGroups: FlowGroup[];
    changedGroups: { groupId: string; changes: FieldChange[] }[];
}
export function diffFlowGraphs(before: FlowGraph, after: FlowGraph): FlowGraphDiff;
```

### Passo a passo

1. `diffFlowGraphs` (posições e tamanhos ignorados; mudança só de posição não aparece).
2. Tela: lista de versões (número, data, nota) à esquerda; seletor "comparar com" (versão anterior por padrão ou rascunho).
3. `VersionDiffView`: seções "Nós", "Grupos", "Conexões"; para `config.prompt`, diff de linhas (verde/vermelho em mono); demais campos como "antes → depois".
4. "Restaurar no rascunho" com confirmação (avisa que substitui o rascunho atual).

## Critérios de aceite

- [ ] Mudar só a posição de nós não gera diferenças.
- [ ] Mudar o effort do Reviewer aparece como `config.effort: medium → high` no nó "Reviewer".
- [ ] Prompt alterado mostra o diff por linhas.
- [ ] Restaurar a v2 torna o rascunho igual à v2.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `graph_diff.test.ts`: adicionados/removidos/alterados, posição ignorada, grupos.
- `versions_page.test.tsx`: comparar e restaurar com API mockada.
