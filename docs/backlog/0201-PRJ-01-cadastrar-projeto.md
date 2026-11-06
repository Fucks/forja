---
key: PRJ-01
title: "Cadastrar projeto a partir de um repositório git local"
type: issue
milestone: "Fase 2 — Projetos, credenciais e ferramentas"
labels: [tipo:feature, area:projetos]
depends_on: [F-05, F-06, F-07, F-09]
---

## Contexto

Atende RF-PRJ-01 e RF-PRJ-04. Tudo na Forja pertence a um projeto: fluxos, runs, itens, gatilhos. Um projeto é um
repositório git local. Esta issue também cria as duas integrações que muitas outras usam: `CommandRunner` (rodar
processos com timeout, atrás de uma interface com fake) e `GitProvider` (consultas git).

## Objetivo

Existe um `project_service` testado e a API `/api/projects` para criar, listar, ver, renomear e remover projetos,
validando o caminho como repositório git e detectando `.codegraph/`, `CODING_STANDARDS.md` e `.sandcastle/`.

## Escopo

**Inclui:** tabela `projects`, `CommandRunner` (execa) + fake, `GitProvider` (consultas) + fake, service, rotas.
**Não inclui:** telas (#{PRJ-02}), configurações do projeto (#{CFG-05}), worktrees e push (#{GIT-01}).

## Especificação técnica

### Arquivos

Criar:

- `src/integrations/process/command_runner.ts`
- `src/integrations/process/execa_command_runner.ts`
- `src/test/fakes/fake_command_runner.ts`
- `src/integrations/git/git_provider.ts`
- `src/integrations/git/cli_git_provider.ts`
- `src/test/fakes/fake_git_provider.ts`
- `src/server/db/migrations/0100_projects.sql`
- `src/server/db/schema/projects.ts`
- `src/server/projects/project_types.ts`
- `src/server/projects/project_repository.ts`
- `src/server/projects/project_service.ts`
- `src/server/projects/projects_routes.ts`
- `src/server/projects/project_service.test.ts`
- `src/server/projects/projects_routes.test.ts`
- `src/integrations/git/cli_git_provider.integration.test.ts`
  Alterar:
- (o arquivo `*_routes.ts` desta issue já existe como stub criado em #{F-03}: substitua o conteúdo; **não** altere `src/server/route_modules.ts`)
- `src/server/app.ts` (`AppDeps` ganha `commands: CommandRunner`, `git: GitProvider`)

### Contratos

```ts
export interface CommandResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
}
export interface CommandRunner {
    run(
        command: string,
        args: string[],
        options: {
            cwd?: string;
            env?: Record<string, string>;
            timeoutMs: number;
            input?: string;
            signal?: AbortSignal;
        },
    ): Promise<CommandResult>;
}

export interface RepoInfo {
    root: string;
    currentBranch: string;
    defaultBranch: string;
    remoteUrl?: string;
    githubRepo?: string; /* "owner/name" quando o remote é do GitHub */
}
export interface GitProvider {
    inspectRepo(path: string): Promise<RepoInfo>; // NotARepoError se não for repo
    branchExists(root: string, branch: string): Promise<boolean>;
}

export interface Project {
    id: string;
    name: string;
    repoPath: string;
    githubRepo?: string;
    baseBranch: string;
    detected: { codegraph: boolean; codingStandards: boolean; sandcastle: boolean };
    createdAt: string;
    updatedAt: string;
}
export const createProjectInput = z.object({
    name: z.string().trim().min(1).max(80),
    repoPath: z.string().min(1),
    baseBranch: z.string().optional(),
});
export interface ProjectService {
    create(input: z.infer<typeof createProjectInput>): Promise<Project>;
    list(): Promise<Project[]>;
    get(id: string): Promise<Project>; // NotFoundError
    rename(id: string, name: string): Promise<Project>;
    remove(id: string): Promise<void>; // não apaga nada do repositório
}
export function createProjectService(deps: {
    repo: ProjectRepository;
    git: GitProvider;
    fileExists(p: string): boolean;
    clock: Clock;
}): ProjectService;
```

Tabela `projects(id, name, repo_path UNIQUE, github_repo, base_branch, detected_json, created_at, updated_at)`.
Rotas: `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id`.

`CliGitProvider` usa `git rev-parse --show-toplevel`, `git branch --show-current`,
`git symbolic-ref refs/remotes/origin/HEAD` (fallback `main`), `git remote get-url origin`. Extrai `owner/name`
de URLs `https://github.com/o/n(.git)` e `git@github.com:o/n(.git)`.

### Passo a passo

1. `CommandRunner` com execa (`reject: false`, `windowsHide: true`, `timeout`, `cancelSignal`) e o fake roteirizável (`when(cmd, args).returns(result)`; registra chamadas).
2. `CliGitProvider` e `FakeGitProvider`.
3. Migração, schema Drizzle, repositório.
4. Service: normaliza `repoPath` para o `root` do repo; rejeita caminho duplicado (`ConflictError`); `baseBranch` padrão = `defaultBranch` (ou `development` se existir); detecta arquivos.
5. Rotas com Zod.

## Critérios de aceite

- [ ] Criar projeto com caminho de um subdiretório do repo grava o `root` do repositório.
- [ ] Caminho que não é repositório git → 422 com mensagem clara.
- [ ] Mesmo repositório duas vezes → 409.
- [ ] `githubRepo` preenchido a partir do remote HTTPS ou SSH do GitHub.
- [ ] `detected` reflete a presença de `.codegraph/`, `CODING_STANDARDS.md` e `.sandcastle/`.
- [ ] Remover o projeto não toca no repositório.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `project_service.test.ts` (FakeGitProvider, `createTestDb`): criação, normalização, duplicado, não-repo, detecção, rename, remove.
- `projects_routes.test.ts`: status codes e formato de erro.
- `cli_git_provider.integration.test.ts`: repo temporário real com `git init` (fora do `npm run test`).
