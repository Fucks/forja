---
key: BRD-02
title: "GitHubProvider via gh: issues, dependências e PRs"
type: issue
milestone: "Fase 8 — Board e itens"
labels: [tipo:feature, area:board]
depends_on: [PRJ-01]
---

## Contexto
Atende RF-BRD-02 e RF-GIT-01/02. A Forja fala com o GitHub pelo CLI `gh` do host (diagnóstico em #{CFG-03}), como o
pipeline atual. Precisamos listar issues por label com suas dependências, comentar, fechar e abrir/consultar PRs. As
dependências vêm de duas fontes: a seção "Bloqueada por: #A, #B" que o script de backlog injeta no corpo, e as
dependências nativas do GitHub quando disponíveis.

## Objetivo
Existe `GitHubProvider` (interface + implementação com `gh` + fake) testado, com parsing robusto das saídas JSON e das
dependências no corpo da issue.

## Escopo
**Inclui:** listar issues, ler uma issue, comentar, fechar, abrir PR, consultar PR por branch, parser de dependências.
**Não inclui:** sincronização (#{BRD-03}), push de branch (#{GIT-01}).

## Especificação técnica
### Arquivos
Criar:
- `src/integrations/github/github_provider.ts`
- `src/integrations/github/gh_cli_github_provider.ts`
- `src/integrations/github/blocked_by_parser.ts`
- `src/test/fakes/fake_github_provider.ts`
- `src/integrations/github/gh_cli_github_provider.test.ts`
- `src/integrations/github/blocked_by_parser.test.ts`

### Contratos
```ts
export interface GithubIssue { number: number; title: string; body: string; url: string; labels: string[]; state: "open" | "closed"; blockedByNumbers: number[] }
export interface GithubPullRequest { number: number; url: string; state: "open" | "closed" | "merged"; headBranch: string; baseBranch: string }
export interface GitHubProvider {
    listIssues(repo: string, opts: { label?: string; state: "open" | "closed" | "all"; limit: number }): Promise<GithubIssue[]>;
    getIssue(repo: string, number: number): Promise<GithubIssue>;
    comment(repo: string, number: number, body: string): Promise<void>;
    closeIssue(repo: string, number: number): Promise<void>;
    createPullRequest(repo: string, input: { head: string; base: string; title: string; body: string; draft: boolean }): Promise<GithubPullRequest>;
    findPullRequestByHead(repo: string, head: string): Promise<GithubPullRequest | undefined>;
}
export function parseBlockedBy(body: string): number[]; // linhas "Bloqueada por:", "Blocked by:", "Depende de:" com #N separados por vírgula
export function createGhCliGitHubProvider(deps: { commands: CommandRunner; env: Record<string, string> /* GH_TOKEN opcional */ }): GitHubProvider;
```
Comandos: `gh issue list --repo R --label L --state S --limit N --json number,title,body,url,labels,state`;
`gh issue view N --repo R --json ...`; `gh issue comment N --repo R --body-file -` (corpo via stdin); `gh issue close`;
`gh pr create --repo R --head H --base B --title T --body-file - [--draft]` (devolve a URL; depois `gh pr view <url> --json number,url,state,headRefName,baseRefName`);
`gh pr list --repo R --head H --state all --json number,url,state,headRefName,baseRefName,mergedAt`.
Dependências nativas: tente `gh api repos/R/issues/N/dependencies/blocked_by --jq '.[].number'`; erro 404 → ignore e use só o corpo.
Corpo de comentário e de PR sempre por stdin (nunca argv — tamanho e caracteres especiais).

### Passo a passo
1. `parseBlockedBy` puro com testes (formato do `backlog.mjs`: "Bloqueada por: #12, #15").
2. Implementação com `CommandRunner`; erros do `gh` viram `GitHubError` com stderr.
3. Fake com issues e PRs em memória.

## Critérios de aceite
- [ ] `listIssues` interpreta o JSON do `gh` e preenche `blockedByNumbers` do corpo e das dependências nativas (sem duplicar).
- [ ] 404 nas dependências nativas não quebra a listagem.
- [ ] Comentários e corpo de PR vão por stdin.
- [ ] `findPullRequestByHead` reporta `merged` quando `mergedAt` existe.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `blocked_by_parser.test.ts`; `gh_cli_github_provider.test.ts` (FakeCommandRunner com saídas JSON gravadas).
