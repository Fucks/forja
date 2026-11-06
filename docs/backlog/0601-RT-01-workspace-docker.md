---
key: RT-01
title: "Runtime próprio: workspace por item com git worktree e container Docker"
type: issue
milestone: "Fase 6 — Runtime de agentes"
labels: [tipo:feature, area:harness]
depends_on: [ENG-01]
---

## Contexto

Atende RF-RUN-08 (Docker por nó) e RNF-EXT-01. A Forja tem **runtime próprio** (decisão do PRD): nada de biblioteca de
terceiros entre o motor e o container, para que o funcionamento possa mudar no futuro (outro isolamento, outro harness,
reaproveitar containers, rodar remoto). Cada item de trabalho ganha um **workspace**: um git worktree no host, no branch do
item, montado num container Docker de longa duração (`sleep infinity`) onde os nós daquele item rodam com `docker exec`.
É o mesmo modelo que o pipeline atual usa e que a imagem de `.sandcastle/Dockerfile` já suporta (usuário `agent`,
worktree em `/home/agent/workspace`).

Tudo passa pelo `CommandRunner` de #{PRJ-01} (`git` e `docker` do host), então os testes rodam com `FakeCommandRunner`.

## Objetivo

Existe `DockerAgentRuntime` que implementa `openWorkspace`, `listOpenWorkspaces`, `closeWorkspace` e, no `Workspace`,
`exec`, `diff`, `writeFiles` e `close`, com containers e worktrees identificáveis para limpeza de órfãos — a execução do
agente em si fica em #{RT-02}.

## Escopo

**Inclui:** `WorktreeManager` (criar/reusar/remover worktree), `ContainerManager` (run, exec com streaming, rm), labels Docker,
setup do workspace, `listOpenWorkspaces` a partir do Docker (sobrevive a reinício), escrita de arquivos no worktree, `runHeadless`
(container efêmero sem worktree de escrita).
**Não inclui:** rodar o `claude` (#{RT-02}), imagem (#{RT-06}), ferramentas (#{RT-07}), credenciais (#{RT-08}).

## Especificação técnica

### Arquivos

Criar:

- `src/integrations/agent_runtime/worktree_manager.ts`
- `src/integrations/agent_runtime/container_manager.ts`
- `src/integrations/agent_runtime/docker_agent_runtime.ts`
- `src/integrations/agent_runtime/worktree_manager.test.ts`
- `src/integrations/agent_runtime/container_manager.test.ts`
- `src/integrations/agent_runtime/docker_agent_runtime.test.ts`
- `src/integrations/agent_runtime/docker_agent_runtime.integration.test.ts`
  Alterar:
- `src/integrations/agent_runtime/agent_runtime.ts` (método `Workspace.writeFiles(files)`; `Workspace.root` com o caminho do worktree no host)
- `src/test/fakes/fake_agent_runtime.ts` (`writeFiles` em memória)

### Contratos

```ts
export interface WorktreeManager {
    ensure(input: {
        repoPath: string;
        worktreesDir: string;
        branch: string;
        baseBranch: string;
    }): Promise<{ path: string; created: boolean }>;
    // branch existe (local ou origin) → `git worktree add <path> <branch>`; senão `git worktree add -b <branch> <path> origin/<base>` (fallback <base>)
    // worktree já registrado no mesmo caminho → reusa
    remove(repoPath: string, path: string): Promise<void>; // `git worktree remove --force`, depois `git worktree prune`
}
export interface ContainerManager {
    start(input: {
        name: string;
        image: string;
        mounts: { host: string; container: string; readOnly?: boolean }[];
        labels: Record<string, string>;
        workdir: string;
        user?: string;
        network?: string;
    }): Promise<{ id: string }>; // docker run -d --rm=false ... <image> sleep infinity
    exec(
        id: string,
        command: string[],
        opts: {
            env: Record<string, string>;
            stdin?: string;
            timeoutMs: number;
            signal: AbortSignal;
            onStdoutLine?(line: string): void;
            onStderrLine?(line: string): void;
        },
    ): Promise<{ exitCode: number; stdoutTail: string; stderrTail: string }>;
    stop(id: string): Promise<void>; // docker rm -f (idempotente)
    list(labels: Record<string, string>): Promise<{ id: string; labels: Record<string, string> }[]>; // docker ps -a --filter label=...
}
export function createDockerAgentRuntime(deps: {
    commands: CommandRunner;
    paths: ForjaPaths;
    clock: Clock;
    hostUser: { uid: number; gid: number } | null;
    runAgentInContainer: RunAgentInContainer; /* #{RT-02}; aqui um stub que lança "não implementado" */
}): AgentRuntime;
```

### Semântica

- **Worktree** em `~/.forja/worktrees/<projectId>/<branch com / trocado por __>` (fora do repositório do usuário, nada a ignorar no git dele).
- **Container**: nome `forja-<runId curto>-<itemId curto>`; labels `forja.workspace=<id>`, `forja.run=<runId>`, `forja.item=<workItemId>`,
  `forja.project=<projectId>`; mounts: worktree → `/home/agent/workspace` e o `.git` comum do repositório
  (`git rev-parse --git-common-dir`) no **mesmo caminho absoluto** dentro do container (sem isso o worktree não funciona lá dentro;
  no Windows, converta `C:\x` para o caminho que o Docker Desktop aceita e registre o mapeamento); `--user uid:gid` quando
  `hostUser` existe (Linux/macOS), padrão da imagem no Windows; `-w /home/agent/workspace`.
- **Segredos nunca em argv**: `exec` passa variáveis com `docker exec -e NOME` (sem valor) e coloca o valor no `env` do processo
  `docker` no host — o Docker lê do ambiente do cliente. O `ContainerManager` é o único lugar que monta esses argumentos.
- **Setup**: após `start`, escreve `spec.files` no worktree (host) e roda `spec.setupCommands` com `exec`, emitindo cada linha como
  `AgentEvent` `system`; falha → `WorkspaceError` com a cauda da saída, e o container é removido.
- `exec` aborta pelo `signal`: mata o processo `docker exec` no host **e** roda `docker exec <id> pkill -f -- "<marcador>"` (cada exec
  recebe um marcador único em variável `FORJA_EXEC_ID` para poder ser encerrado) — documente a limitação se `pkill` não existir na imagem.
- `diff(base)`: `git diff --stat <base>...HEAD` + `git diff <base>...HEAD` no worktree pelo host, truncado em 200 KB.
- `close()`: `stop` + `WorktreeManager.remove` — **mantém o branch** (commits do agente ficam). Idempotente.
- `listOpenWorkspaces`: `list({ "forja.workspace": "" })` (todos com o label) → permite à recuperação (#{ENG-11}) achar órfãos após reinício.
- `runHeadless`: container efêmero com o repositório montado **somente leitura** em `/home/agent/workspace` (sem worktree), removido no fim.

### Passo a passo

1. `WorktreeManager` e `ContainerManager` sobre `CommandRunner`, com testes que conferem os argumentos exatos.
2. `DockerAgentRuntime` juntando os dois, com registro de workspaces e `runHeadless`.
3. Teste de integração (`describe.skipIf(!process.env.FORJA_IT_DOCKER)`): repo temporário, imagem `node:22-bookworm-slim`, abrir
   workspace, `exec(["git", "status"])` dentro do container, `writeFiles`, fechar e conferir que container e worktree sumiram e o branch ficou.

## Critérios de aceite

- [ ] `openWorkspace` cria o worktree no branch do item (novo a partir da base, ou existente) e sobe o container com os mounts e labels documentados.
- [ ] Abrir duas vezes o mesmo item reusa o worktree.
- [ ] Nenhum valor de variável de ambiente aparece nos argumentos passados ao `CommandRunner` (só nomes).
- [ ] Falha de setup remove o container e lança `WorkspaceError` com a saída.
- [ ] `close` remove container e worktree e preserva o branch; chamar de novo não falha.
- [ ] `listOpenWorkspaces` encontra containers da Forja pelo label mesmo sem estado em memória.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `worktree_manager.test.ts`, `container_manager.test.ts`, `docker_agent_runtime.test.ts` (FakeCommandRunner): argumentos, reuso, falhas, segredos fora do argv.
- `docker_agent_runtime.integration.test.ts`: opcional, com Docker real.
