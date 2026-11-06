---
key: BRD-03
title: "Sincronizar issues do GitHub com os itens de trabalho"
type: issue
milestone: "Fase 8 — Board e itens"
labels: [tipo:feature, area:board]
depends_on: [BRD-01, BRD-02, CFG-05]
---

## Contexto

Atende RF-BRD-02. O board e o nó `source` precisam das issues do repositório do projeto (`Project.githubRepo`, #{PRJ-01})
como `WorkItem`s locais, atualizados periodicamente e sob demanda, para que "bloqueada por" e estado (aberta/fechada)
estejam corretos antes de cada run.

## Objetivo

Existe `syncGithubIssues(projectId, opts)` que importa e atualiza as issues (por label configurável ou todas abertas) via
`GitHubProvider`, roda sob demanda pela API e automaticamente a cada 5 min para projetos com GitHub.

## Escopo

**Inclui:** sync completo de abertas + atualização de itens conhecidos que fecharam, label padrão do projeto, rota, timer.
**Não inclui:** sync de PRs (#{GIT-02}).

## Especificação técnica

### Arquivos

Criar:

- `src/server/work_items/github_sync.ts`
- `src/server/work_items/github_sync.test.ts`
- `src/server/work_items/sync_scheduler.ts`
  Alterar:
- `src/server/work_items/work_items_routes.ts` (`POST /api/projects/:projectId/work-items/sync`)
- (o `sync_scheduler` é iniciado em `registerWorkItemsRoutes` com `app.addHook("onReady")` e parado em `onClose` — convenção de #{F-03}; não altere `main.ts`)

### Contratos

```ts
export interface SyncResult {
    created: number;
    updated: number;
    closed: number;
    at: string;
    error?: string;
}
export async function syncGithubIssues(
    projectId: string,
    deps: {
        projects: ProjectService;
        items: WorkItemService;
        github: GitHubProvider;
        githubEnv(projectId: string): Promise<Record<string, string>>;
    },
    opts?: { label?: string; limit?: number },
): Promise<SyncResult>;
export function createSyncScheduler(deps: {
    clock: Clock;
    intervalMs: number;
    listProjectIds(): Promise<string[]>;
    sync(id: string): Promise<SyncResult>;
}): { start(): void; stop(): void };
```

- Busca abertas (`state: open`, label opcional, limite 200) e, para itens locais `source: github` ainda `open` que não
  vieram na lista, consulta `getIssue` para saber se fecharam.
- Projeto sem `githubRepo` → `SyncResult` com `error: "Projeto sem repositório GitHub"`, sem lançar.
- `githubEnv` usa a credencial GitHub do projeto (#{CFG-05}) se houver; senão o `gh` do host autenticado.
- Erros de rede/gh ficam no resultado e no log; o timer continua.

### Passo a passo

1. `syncGithubIssues` com `FakeGitHubProvider`.
2. Rota sob demanda (resposta com `SyncResult`).
3. Scheduler com `Clock` (5 min), iniciado pelos hooks do Fastify.

## Critérios de aceite

- [ ] Primeiro sync cria os itens; o segundo, sem mudanças, não altera nada.
- [ ] Issue fechada no GitHub vira `closed` no item.
- [ ] Dependências por corpo resolvem para ids de itens.
- [ ] Projeto sem GitHub devolve o erro no resultado.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `github_sync.test.ts` (fakes): criação, idempotência, fechamento, dependências, falha do provider; scheduler com FakeClock.
