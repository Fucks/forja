---
key: GIT-01
title: "Nó git: rebase, push e abertura de PR"
type: issue
milestone: "Fase 10 — Git, gates e PR"
labels: [tipo:feature, area:git]
depends_on: [BRD-04, RT-08]
---

## Contexto

Atende RF-GIT-01. O fim da linha de montagem é um PR para a branch base do projeto, com corpo vindo de um artefato (o
resumo do Reviewer ou o relatório de evidências). O pipeline atual faz isso no host (`git push` + `gh pr create`) depois
que um agente rebaser resolve conflitos — a Forja faz o mesmo: o nó `git` opera dentro do workspace do item (o branch está
no worktree do host montado no container) e usa o `GitHubProvider` (#{BRD-02}) no host.

## Objetivo

O executor do nó `git` faz `rebase` (com agente resolvendo conflitos), `push` e `open_pr`, gravando branch e URL do PR como
artefatos, e é idempotente (reabrir PR existente em vez de criar outro).

## Escopo

**Inclui:** executor `git` com as três ações, prompt padrão do rebaser (adaptado de `.sandcastle/rebase-prompt.md`), push com
credencial do GitHub, PR via provider, artefatos `branch` e `pr_url`.
**Não inclui:** merge (nunca automático no MVP), sync de PR mesclado (#{GIT-02}).

## Especificação técnica

### Arquivos

Criar:

- `src/server/runtime/executors/git_executor.ts`
- `src/server/runtime/executors/git_executor.test.ts`
- `src/server/runtime/executors/prompts/rebase.md`
- `src/server/runtime/executors/pr_title.ts`
  Alterar:
- `src/server/runtime/node_executors.ts`
- `src/integrations/git/git_provider.ts` e `cli_git_provider.ts` (`push(root, branch, env)`, `aheadBehind(root, branch, base)`), `src/test/fakes/fake_git_provider.ts`

### Contratos e semântica

- `rebase`: `workspace.exec("git fetch origin <base> && git rebase origin/<base>")`; com conflito (exit ≠ 0), roda um agente no
  workspace com o prompt `rebase.md` (modelo/effort padrão do projeto, `maxIterations` 20) e confere que não restam
  conflitos (`git diff --name-only --diff-filter=U` vazio) e que o rebase terminou; senão falha com "conflitos não resolvidos".
- `push`: no host, `git push --force-with-lease origin <branch>` no `repoPath` com `GH_TOKEN` quando houver; push forçado
  só com `--force-with-lease` (o rebase reescreve o branch). Sem commits à frente da base → `SKIPPED`-like: saída
  `{ branch, pushed: false }` e o PR não é aberto (o nó `open_pr` a jusante recebe `pushed: false` e devolve `prUrl: undefined`).
- `open_pr`: push (se ainda não feito) + `findPullRequestByHead`; se existe aberto, reutiliza (atualiza o corpo com comentário);
  senão `createPullRequest({ head: branch, base, title: prTitle(item), body: inputs[bodyFrom] ?? resumo padrão, draft })`.
  Corpo termina com `Closes #<número>` para issues do GitHub e com `🤖 Gerado pela Forja`.
- `prTitle(item)`: `"<título da issue> (#<número>)"`.
- Artefatos: `branch` e `pr_url`. Saída `result = { branch, prUrl?, pushed }`.

### Passo a passo

1. Extensões do `GitProvider`.
2. Prompt do rebaser a partir de `.sandcastle/rebase-prompt.md`.
3. Executor com as três ações e testes com `FakeAgentRuntime`, `FakeGitProvider` e `FakeGitHubProvider`.
4. Registro.

## Critérios de aceite

- [ ] `open_pr` sem PR existente cria o PR com título, corpo e `Closes #N`, e grava o artefato `pr_url`.
- [ ] Rodar de novo para o mesmo branch reutiliza o PR aberto.
- [ ] Rebase com conflito chama o agente; conflito que sobra falha com mensagem clara.
- [ ] Push usa `--force-with-lease` e nunca `--force` puro.
- [ ] Branch sem commits à frente não abre PR.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `git_executor.test.ts`: cada ação e caso de borda acima.
