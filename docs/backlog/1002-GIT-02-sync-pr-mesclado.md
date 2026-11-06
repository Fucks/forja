---
key: GIT-02
title: "Sincronizar PR mesclado: fechar issue, mover card e limpar branch"
type: issue
milestone: "Fase 10 — Git, gates e PR"
labels: [tipo:feature, area:git]
depends_on: [GIT-01, BRD-06]
---

## Contexto

Atende RF-GIT-02. No pipeline atual, a fase 0 de cada rodada fecha as issues cujos PRs foram mesclados — é isso que
desbloqueia as dependentes (`.sandcastle/main.mts`, `closeIssuesWithMergedPullRequests`). A Forja faz o mesmo
periodicamente: PR mesclado → issue fechada (se o `Closes #N` não fechou), item "Concluído", branch local removido; e o nó
`output` com `commentOnIssue` passa a comentar na issue.

## Objetivo

Um job a cada 5 min (e sob demanda) verifica os PRs abertos pela Forja, fecha issues e move itens quando mesclados, remove
branches locais, e o nó `output` comenta na issue com o resultado da run.

## Escopo

**Inclui:** `pull_request_sync`, job pelos hooks das rotas de itens, comentário do `output`, rota sob demanda.
**Não inclui:** apagar branch remoto (o GitHub faz ao mesclar, se configurado).

## Especificação técnica

### Arquivos

Criar:

- `src/server/work_items/pull_request_sync.ts`
- `src/server/work_items/pull_request_sync.test.ts`
  Alterar:
- `src/server/work_items/work_items_routes.ts` (iniciar o job junto do sync de issues; `POST /api/projects/:projectId/pull-requests/sync`)
- `src/server/runtime/executors/output_executor.ts` (comentar na issue quando `commentOnIssue`)
- `src/integrations/git/git_provider.ts`, `cli_git_provider.ts`, `fake_git_provider.ts` (`deleteLocalBranch(root, branch)`)

### Contratos

```ts
export async function syncPullRequests(
    projectId: string,
    deps: {
        runs: RunRepository;
        items: WorkItemService;
        github: GitHubProvider;
        git: GitProvider;
        projects: ProjectService;
    },
): Promise<{ merged: number; closedIssues: number; deletedBranches: number }>;
```

- Fonte dos PRs: artefatos `pr_url` das runs dos últimos 30 dias, por item.
- `merged` → `items.setManualColumn(id, "done")`, `closeIssue` se ainda aberta, `deleteLocalBranch` (ignora erro se o
  branch está em uso por um worktree ativo), evento `work_item.updated`. Como fechar a issue desbloqueia dependentes, o
  próximo `source` já os encontra.
- Comentário do `output`: "Forja: run <link local não ajuda no GitHub — use texto> concluída — PR #N aberto / item precisa de
  revisão humana (motivo)". Texto curto, sem URLs `127.0.0.1`.

### Passo a passo

1. `syncPullRequests` com fakes.
2. Job e rota.
3. Comentário no `output_executor`.

## Critérios de aceite

- [ ] PR mesclado fecha a issue (quando ainda aberta), move o item para "Concluído" e remove o branch local.
- [ ] PR fechado sem merge não altera o item.
- [ ] Sync repetido não faz nada a mais.
- [ ] `output` com `commentOnIssue` comenta uma vez por run.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `pull_request_sync.test.ts`; ajuste em `deterministic_executors.test.ts` para o comentário.
