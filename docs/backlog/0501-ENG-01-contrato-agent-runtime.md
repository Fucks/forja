---
key: ENG-01
title: "Contrato AgentRuntime e FakeAgentRuntime roteirizável"
type: issue
milestone: "Fase 5 — Motor de execução"
labels: [tipo:feature, area:motor]
depends_on: [FLW-01, F-07]
---

## Contexto

Atende RNF-EXT-01 e RNF-MAN-01. O motor e a UI precisam ser construídos e testados sem Docker e sem o `claude` real
(o sandbox do pipeline não tem nenhum dos dois). A interface `AgentRuntime` é **da Forja**: workspace por item, rodar um
agente com eventos em tempo real, saída estruturada, uso de tokens e cancelamento. A implementação real (`DockerAgentRuntime`,
#{RT-01}/#{RT-02}) é própria e pode ser trocada no futuro (outro isolamento, outro harness) sem mexer no motor. O `FakeAgentRuntime` é roteirizável e será usado por
todos os testes de motor, de executor e pelo modo demo (#{OBS-06}).

## Objetivo

Existem o contrato `AgentRuntime` com seus tipos e erros, e um `FakeAgentRuntime` roteirizável com relógio fake que
simula eventos, duração, saída estruturada, commits, falhas, timeouts e limite de uso.

## Escopo

**Inclui:** tipos, erros tipados, fake com roteiro por nó/item, registro de chamadas.
**Não inclui:** implementação real (#{RT-01}, #{RT-02}), parser de limite (#{RT-04}).

## Especificação técnica

### Arquivos

Criar:

- `src/integrations/agent_runtime/agent_runtime.ts`
- `src/integrations/agent_runtime/agent_errors.ts`
- `src/test/fakes/fake_agent_runtime.ts`
- `src/test/fakes/fake_agent_runtime.test.ts`

### Contratos

```ts
export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
}
export type AgentEvent =
    | { kind: "text"; text: string; at: Date; iteration: number }
    | { kind: "tool_call"; name: string; args: string; at: Date; iteration: number }
    | { kind: "raw"; line: string; at: Date; iteration: number }
    | { kind: "system"; message: string; at: Date }; // eventos do runtime: "workspace pronto", "npm i concluído"

export interface WorkspaceSpec {
    projectId: string;
    runId: string;
    workItemId: string;
    repoPath: string;
    branch: string;
    baseBranch: string;
    image: string;
    env: Record<string, string>;
    setupCommands: { command: string; timeoutMs: number }[]; // ex.: "npm i", "codegraph init --yes"
    files: { path: string; content: string }[]; // escritos no worktree antes do agente (#{RT-07})
}
export interface AgentRunRequest {
    nodeRunId: string;
    prompt: string;
    model: string;
    effort: Effort;
    maxIterations: number;
    idleTimeoutSeconds: number;
    timeoutMs: number;
    permissionMode: PermissionMode;
    outputSchema?: Record<string, unknown>;
    completionSignal?: string;
    env: Record<string, string>;
    signal: AbortSignal;
}
export interface AgentRunResult {
    output?: unknown;
    summary: string /* último texto do agente, truncado em 4 000 chars */;
    commits: { sha: string }[];
    usage: TokenUsage;
    sessionId?: string;
    iterations: number;
    completionSignal?: string;
}
export interface AgentRunHooks {
    onEvent(event: AgentEvent): void;
}
export interface Workspace {
    id: string;
    branch: string;
    runAgent(request: AgentRunRequest, hooks: AgentRunHooks): Promise<AgentRunResult>;
    exec(
        command: string,
        options: { timeoutMs: number; signal: AbortSignal; onOutput?(line: string): void },
    ): Promise<{ exitCode: number; stdoutTail: string }>;
    diff(baseBranch: string): Promise<string>; // git diff base...branch (para gates)
    close(): Promise<void>;
}
export interface AgentRuntime {
    openWorkspace(
        spec: WorkspaceSpec,
        hooks: AgentRunHooks,
        signal: AbortSignal,
    ): Promise<Workspace>;
    runHeadless(
        spec: Omit<WorkspaceSpec, "branch" | "workItemId" | "files"> & { workItemId?: string },
        request: AgentRunRequest,
        hooks: AgentRunHooks,
    ): Promise<AgentRunResult>; // workspace "none"
    listOpenWorkspaces(): Promise<{ id: string; runId: string; workItemId: string }[]>;
    closeWorkspace(id: string): Promise<void>;
}

// agent_errors.ts — o motor decide a política a partir do tipo
export class UsageLimitError extends Error {
    resetAt?: Date;
}
export class AgentTimeoutError extends Error {
    kind: "total" | "idle";
}
export class StructuredOutputError extends Error {
    raw?: string;
}
export class AgentCanceledError extends Error {}
export class WorkspaceError extends Error {} // Docker indisponível, imagem ausente, setup falhou
export class AgentRuntimeError extends Error {} // demais falhas do agente
```

```ts
// fake_agent_runtime.ts
export interface ScriptedStep {
    match: { nodeRunId?: string; promptIncludes?: string; workItemId?: string };
    durationMs: number; // avançado via FakeClock
    events?: Omit<AgentEvent, "at">[]; // distribuídos ao longo da duração
    result?: Partial<AgentRunResult>; // default: summary "ok", usage 1000/200, sem commits
    error?:
        | { type: "usage_limit"; resetAt?: Date }
        | { type: "timeout"; kind: "total" | "idle" }
        | { type: "structured_output" }
        | { type: "runtime"; message: string }
        | { type: "workspace"; message: string };
    times?: number; // quantas vezes o passo casa (padrão: infinito)
}
export class FakeAgentRuntime implements AgentRuntime {
    constructor(opts: { clock: FakeClock; steps?: ScriptedStep[]; defaultDurationMs?: number });
    script(step: ScriptedStep): this;
    readonly calls: {
        kind: "open" | "run" | "headless" | "exec" | "close";
        nodeRunId?: string;
        workItemId?: string;
        at: Date;
    }[];
    peakConcurrentRuns(): number;
}
```

### Passo a passo

1. Tipos e erros (`Effort` e `PermissionMode` vêm de `src/shared/agent_types.ts`, criado em #{FLW-01}).
2. `FakeAgentRuntime`: cada `runAgent` encontra o primeiro passo que casa, agenda eventos no `FakeClock`, resolve ou
   rejeita ao fim da duração; respeita `signal` (rejeita `AgentCanceledError` imediatamente); `exec` devolve `exitCode 0` por padrão (roteirizável por comando).
3. Registro de chamadas e pico de concorrência.

## Critérios de aceite

- [ ] Um passo com `durationMs: 30_000` só resolve após `clock.advance(30_000)`.
- [ ] Eventos roteirizados chegam a `onEvent` em ordem com `at` do relógio fake.
- [ ] Cada tipo de `error` vira a classe de erro correspondente.
- [ ] Abortar o `signal` rejeita com `AgentCanceledError` e libera a concorrência.
- [ ] `peakConcurrentRuns()` reflete execuções sobrepostas.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `fake_agent_runtime.test.ts`: casamento de passos (`times`), duração, eventos, erros, cancelamento, pico.
