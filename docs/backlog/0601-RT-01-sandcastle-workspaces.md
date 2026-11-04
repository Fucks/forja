---
key: RT-01
title: "SandcastleAgentRuntime: workspace Docker por item"
type: issue
milestone: "Fase 6 — Runtime Sandcastle"
labels: [tipo:feature, area:harness]
depends_on: [ENG-01]
---

## Contexto
Atende RF-RUN-08 (Docker por nó, escolha do usuário) usando o Sandcastle 0.12 como runtime (decisão do PRD). Cada item
de trabalho ganha um sandbox Docker com o worktree do seu branch montado (`sandcastle.createSandbox`), compartilhado
pelos nós daquele item. Para que os testes rodem sem Docker, todo acesso ao Sandcastle passa por uma fachada
`SandcastleApi` injetável — os testes usam uma fachada falsa.

## Objetivo
Existe `SandcastleAgentRuntime` que implementa `openWorkspace`, `listOpenWorkspaces`, `closeWorkspace` e o `exec`/`diff`/
`close` do `Workspace` sobre o Sandcastle, testado com fachada falsa e com um teste de integração opcional real.

## Escopo
**Inclui:** fachada, criação do sandbox (branch, base, imagem, env, hooks de setup, arquivos no worktree), `exec` com
streaming de linhas, `diff`, fechamento, registro de workspaces abertos.
**Não inclui:** rodar o agente (#{RT-02}), imagem (#{RT-06}), arquivos de perfil (#{RT-07}), credenciais (#{RT-08}).

## Especificação técnica
### Arquivos
Criar:
- `src/integrations/agent_runtime/sandcastle_api.ts`
- `src/integrations/agent_runtime/sandcastle_agent_runtime.ts`
- `src/test/fakes/fake_sandcastle_api.ts`
- `src/integrations/agent_runtime/sandcastle_agent_runtime.test.ts`
- `src/integrations/agent_runtime/sandcastle_agent_runtime.integration.test.ts`
Alterar:

### Contratos
```ts
// sandcastle_api.ts — única importação de "@ai-hero/sandcastle" no projeto
export interface SandcastleApi {
    createSandbox(options: { branch: string; baseBranch: string; cwd: string; imageName: string; env: Record<string, string>;
        hooks: { sandbox: { onSandboxReady: { command: string; timeoutMs: number }[] } } }): Promise<SandcastleSandbox>;
    runHeadless(options: { cwd: string; imageName: string; env: Record<string, string>; run: SandcastleRunOptions }): Promise<SandcastleRunResult>;
}
export interface SandcastleSandbox {
    branch: string; worktreePath: string;
    run(options: SandcastleRunOptions): Promise<SandcastleRunResult>;
    exec(command: string, options?: { onLine?(line: string): void }): Promise<{ exitCode: number; stdout: string; stderr: string }>;
    close(): Promise<void>;
}
export function createSandcastleApi(): SandcastleApi; // implementação real: sandcastle.createSandbox / sandcastle.run com docker({ imageName, env })
// SandcastleRunOptions/Result: subconjunto tipado do que #{RT-02} usa (prompt, agent, maxIterations, idleTimeoutSeconds, output, logging, signal, completionSignal; iterations, stdout, commits)

export function createSandcastleAgentRuntime(deps: { api: SandcastleApi; writeFile(path: string, content: string): Promise<void>; clock: Clock; newId(p: "art"): string }): AgentRuntime;
```

### Semântica
- `openWorkspace(spec)`: `api.createSandbox({ branch: spec.branch, baseBranch: spec.baseBranch, cwd: spec.repoPath,
  imageName: spec.image, env: spec.env, hooks: { sandbox: { onSandboxReady: spec.setupCommands } } })`; depois escreve
  `spec.files` no `worktreePath` (antes de qualquer agente). Emite `AgentEvent` `system` "workspace pronto (branch X)".
  Falhas viram `WorkspaceError` com a mensagem do Docker/Sandcastle.
- `exec`: `sandbox.exec` com `onLine` → `onOutput`; aborta via `signal` (o Sandcastle não aceita sinal em `exec` —
  ao abortar, rejeite com `AgentCanceledError` e deixe o comando terminar no container); `stdoutTail` = últimas 200 linhas.
- `diff(base)`: `exec("git diff --stat <base>...HEAD && git diff <base>...HEAD")` truncado em 200 KB.
- `close`: `sandbox.close()`; idempotente. `listOpenWorkspaces` vem do registro em memória do runtime.
- Os worktrees ficam em `<repo>/.sandcastle/worktrees/` (padrão do Sandcastle); verifique que `.sandcastle/worktrees/` está no `.gitignore` do repositório do projeto e avise no evento `system` se não estiver.

### Passo a passo
1. Fachada real (fina) e fachada falsa (registra chamadas, simula `exec` por comando, falhas).
2. Runtime com registro de workspaces abertos.
3. Teste de integração (só com Docker + imagem disponíveis; `describe.skipIf(!process.env.FORJA_IT_DOCKER)`): abrir workspace num repo temporário, `exec("git status")`, fechar.

## Critérios de aceite
- [ ] `openWorkspace` chama `createSandbox` com branch, base, imagem, env e hooks do spec e escreve os arquivos no worktree.
- [ ] Falha do Sandcastle ao criar vira `WorkspaceError` com a mensagem original.
- [ ] `exec` repassa linhas e devolve `exitCode` e cauda do stdout.
- [ ] `close` é idempotente e remove o workspace de `listOpenWorkspaces`.
- [ ] Nenhum arquivo além de `sandcastle_api.ts` importa `@ai-hero/sandcastle`.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `sandcastle_agent_runtime.test.ts` com `FakeSandcastleApi`: os critérios acima.
- `sandcastle_agent_runtime.integration.test.ts`: opcional, com Docker real.
