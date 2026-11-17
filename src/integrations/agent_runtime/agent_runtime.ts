import type { Effort, PermissionMode } from "@/shared/agent_types.js";
import type { TokenUsage } from "@/shared/usage_types.js";

export type AgentEvent =
    | { kind: "text"; text: string; at: Date; iteration: number }
    | { kind: "tool_call"; name: string; args: string; at: Date; iteration: number }
    | { kind: "raw"; line: string; at: Date; iteration: number }
    | { kind: "system"; message: string; at: Date };

export interface SetupCommand {
    command: string;
    timeoutMs: number;
}

/** A directory of the host mounted read-only in the container, outside the worktree. */
export interface RuntimeDir {
    host: string;
    container: string;
}

export interface RuntimeFile {
    hostPath: string;
    containerPath: string;
    content: string;
}

export interface WorkspaceFile {
    path: string;
    content: string;
}

export interface WorkspaceSpec {
    projectId: string;
    runId: string;
    workItemId: string;
    repoPath: string;
    branch: string;
    baseBranch: string;
    image: string;
    env: Record<string, string>;
    setupCommands: SetupCommand[];
    files: WorkspaceFile[];
}

export type HeadlessSpec = Omit<WorkspaceSpec, "branch" | "workItemId" | "files"> & {
    workItemId?: string;
};

export interface AgentRunRequest {
    nodeRunId: string;
    prompt: string;
    model: string;
    effort: Effort;
    maxIterations: number;
    maxTurns?: number;
    maxBudgetUsd?: number;
    idleTimeoutSeconds: number;
    timeoutMs: number;
    permissionMode: PermissionMode;
    outputSchema?: Record<string, unknown>;
    completionSignal?: string;
    /** Tool and MCP flags for the `claude` command. */
    toolArgs: string[];
    /** Written in the runtime dir right before the agent starts; never in the worktree. */
    runtimeFiles: RuntimeFile[];
    /** Replaces each !`command` in the prompt with its output in the workspace. */
    expandPromptCommands: boolean;
    env: Record<string, string>;
    signal: AbortSignal;
}

export interface AgentRunResult {
    output?: unknown;
    /** The agent's last text, truncated to 4 000 characters. */
    summary: string;
    commits: { sha: string }[];
    usage: TokenUsage;
    sessionId?: string;
    iterations: number;
    completionSignal?: string;
}

export interface AgentRunHooks {
    onEvent(event: AgentEvent): void;
}

export interface ExecOptions {
    timeoutMs: number;
    signal: AbortSignal;
    /** Every stdout and stderr line, as it is printed. */
    onOutput?: (line: string) => void;
    /** Added to the env of the workspace; wins over it. */
    env?: Record<string, string>;
    /** Relative to the workspace dir in the container; defaults to it. */
    cwd?: string;
    /** Defaults to `sh`. */
    shell?: string;
}

export interface ExecResult {
    exitCode: number;
    stdoutTail: string;
    stderrTail: string;
}

export interface Workspace {
    id: string;
    branch: string;
    /** Path of the item worktree on the host. */
    root: string;
    runtimeDir: RuntimeDir;
    runAgent(request: AgentRunRequest, hooks: AgentRunHooks): Promise<AgentRunResult>;
    exec(command: string, options: ExecOptions): Promise<ExecResult>;
    /** `git diff base...branch`, used by gates. */
    diff(baseBranch: string): Promise<string>;
    /** Writes the files into the worktree; paths are relative to `root`. */
    writeFiles(files: WorkspaceFile[]): Promise<void>;
    close(): Promise<void>;
}

export interface OpenWorkspaceSummary {
    id: string;
    runId: string;
    workItemId: string;
}

export interface AgentRuntime {
    openWorkspace(
        spec: WorkspaceSpec,
        hooks: AgentRunHooks,
        signal: AbortSignal,
    ): Promise<Workspace>;
    /** Where the runtime files of a headless run go, before it starts. */
    headlessRuntimeDir(runId: string, nodeRunId: string): RuntimeDir;
    /** Runs an agent with workspace "none": no worktree, no branch, no files. */
    runHeadless(
        spec: HeadlessSpec,
        request: AgentRunRequest,
        hooks: AgentRunHooks,
    ): Promise<AgentRunResult>;
    /** Runs a command in an ephemeral container with the repository mounted read-only. */
    execHeadless(spec: HeadlessSpec, command: string, options: ExecOptions): Promise<ExecResult>;
    listOpenWorkspaces(): Promise<OpenWorkspaceSummary[]>;
    closeWorkspace(id: string): Promise<void>;
}
