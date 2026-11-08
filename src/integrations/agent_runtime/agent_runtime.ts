import type { Effort, PermissionMode } from "@/shared/agent_types.js";

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
    | { kind: "system"; message: string; at: Date };

export interface SetupCommand {
    command: string;
    timeoutMs: number;
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
    onOutput?(line: string): void;
}

export interface ExecResult {
    exitCode: number;
    stdoutTail: string;
}

export interface Workspace {
    id: string;
    branch: string;
    /** Path of the item worktree on the host. */
    root: string;
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
    /** Runs an agent with workspace "none": no worktree, no branch, no files. */
    runHeadless(
        spec: HeadlessSpec,
        request: AgentRunRequest,
        hooks: AgentRunHooks,
    ): Promise<AgentRunResult>;
    listOpenWorkspaces(): Promise<OpenWorkspaceSummary[]>;
    closeWorkspace(id: string): Promise<void>;
}
