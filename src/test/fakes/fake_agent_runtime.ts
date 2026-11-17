import { AgentCanceledError } from "@/integrations/agent_runtime/agent_errors.js";
import type {
    AgentRunHooks,
    AgentRunRequest,
    AgentRunResult,
    AgentRuntime,
    ExecOptions,
    ExecResult,
    HeadlessSpec,
    OpenWorkspaceSummary,
    RuntimeDir,
    RuntimeFile,
    Workspace,
    WorkspaceFile,
    WorkspaceSpec,
} from "@/integrations/agent_runtime/agent_runtime.js";
import { RUNTIME_DIR_IN_CONTAINER } from "@/integrations/agent_runtime/workspace_layout.js";
import type { FakeClock } from "@/test/fakes/fake_clock.js";
import {
    createScriptedError,
    createScriptedResult,
    playScriptedRun,
    stepMatches,
    type RunTarget,
    type ScriptedStep,
} from "@/test/fakes/scripted_agent_run.js";
import { playScriptedExec, type ScriptedExec } from "@/test/fakes/scripted_exec.js";

export type { ScriptedExec } from "@/test/fakes/scripted_exec.js";
export type {
    ScriptedError,
    ScriptedEvent,
    ScriptedStep,
} from "@/test/fakes/scripted_agent_run.js";

export interface FakeAgentRuntimeOptions {
    clock: FakeClock;
    steps?: ScriptedStep[];
    defaultDurationMs?: number;
    // Left open by a previous server process, like containers that survive a restart.
    openWorkspaces?: OpenWorkspaceSummary[];
}

export interface RuntimeCall {
    kind: "open" | "run" | "headless" | "exec" | "execHeadless" | "close";
    nodeRunId?: string;
    workItemId?: string;
    at: Date;
}

// What a command received, in the workspace of an item or in an ephemeral container.
export interface ReceivedExec {
    kind: "exec" | "execHeadless";
    command: string;
    workItemId?: string;
    env?: Record<string, string>;
    cwd?: string;
    shell?: string;
}

interface ScriptedStepUsage {
    step: ScriptedStep;
    remainingMatches: number;
}

const DEFAULT_DURATION_MS = 1_000;
const WORKSPACE_READY_MESSAGE = "workspace pronto";
const SUCCESSFUL_EXEC: ScriptedExec = { exitCode: 0, stdoutTail: "" };
const FAKE_WORKTREES_DIR = "/fake/worktrees";
const FAKE_RUNTIME_DIR = "/fake/runtime";

export class FakeAgentRuntime implements AgentRuntime {
    readonly calls: RuntimeCall[] = [];
    readonly openedSpecs: WorkspaceSpec[] = [];
    readonly requests: AgentRunRequest[] = [];
    // The runtime files of every agent run, by host path, as the last run left them.
    readonly runtimeFiles = new Map<string, string>();
    // The base branches the workspaces were diffed against, in call order.
    readonly diffBaseBranches: string[] = [];
    readonly receivedExecs: ReceivedExec[] = [];
    private readonly clock: FakeClock;
    private readonly defaultDurationMs: number;
    private readonly steps: ScriptedStepUsage[] = [];
    private readonly scriptedExecs = new Map<string, ScriptedExec[]>();
    private readonly openWorkspaces = new Map<string, OpenWorkspaceSummary>();
    private readonly workspaceFiles = new Map<string, Map<string, string>>();
    private branchDiff = "";
    private openedWorkspaceCount = 0;
    private activeRunCount = 0;
    private peakActiveRunCount = 0;

    constructor({
        clock,
        steps = [],
        defaultDurationMs = DEFAULT_DURATION_MS,
        openWorkspaces = [],
    }: FakeAgentRuntimeOptions) {
        this.clock = clock;
        this.defaultDurationMs = defaultDurationMs;
        steps.forEach((step) => this.script(step));
        openWorkspaces.forEach((workspace) => this.openWorkspaces.set(workspace.id, workspace));
    }

    script(step: ScriptedStep): this {
        this.steps.push({ step, remainingMatches: step.times ?? Infinity });
        return this;
    }

    // Each call of the command plays the next execution; the last one repeats.
    scriptExec(command: string, ...executions: ScriptedExec[]): this {
        this.scriptedExecs.set(command, executions);
        return this;
    }

    // Every workspace answers diff() with it.
    scriptDiff(diff: string): this {
        this.branchDiff = diff;
        return this;
    }

    filesOf(workspaceId: string): Record<string, string> {
        return Object.fromEntries(this.workspaceFiles.get(workspaceId) ?? []);
    }

    peakConcurrentRuns(): number {
        return this.peakActiveRunCount;
    }

    openWorkspace(
        spec: WorkspaceSpec,
        hooks: AgentRunHooks,
        signal: AbortSignal,
    ): Promise<Workspace> {
        this.record({ kind: "open", workItemId: spec.workItemId });
        this.openedSpecs.push(spec);
        if (signal.aborted) {
            return Promise.reject(new AgentCanceledError());
        }

        const id = this.nextWorkspaceId();
        this.openWorkspaces.set(id, { id, runId: spec.runId, workItemId: spec.workItemId });
        this.storeFiles(id, spec.files);
        hooks.onEvent({ kind: "system", message: WORKSPACE_READY_MESSAGE, at: this.clock.now() });

        return Promise.resolve(this.createWorkspace(id, spec));
    }

    headlessRuntimeDir(runId: string, nodeRunId: string): RuntimeDir {
        return fakeRuntimeDir(`${runId}-${nodeRunId}`);
    }

    runHeadless(
        spec: HeadlessSpec,
        request: AgentRunRequest,
        hooks: AgentRunHooks,
    ): Promise<AgentRunResult> {
        return this.runAgent("headless", { request, hooks, workItemId: spec.workItemId });
    }

    execHeadless(spec: HeadlessSpec, command: string, options: ExecOptions): Promise<ExecResult> {
        return this.exec({ kind: "execHeadless", command, workItemId: spec.workItemId }, options);
    }

    listOpenWorkspaces(): Promise<OpenWorkspaceSummary[]> {
        return Promise.resolve([...this.openWorkspaces.values()]);
    }

    closeWorkspace(id: string): Promise<void> {
        this.record({ kind: "close", workItemId: this.openWorkspaces.get(id)?.workItemId });
        this.openWorkspaces.delete(id);

        return Promise.resolve();
    }

    // Skips the ids of the workspaces left open by a previous process.
    private nextWorkspaceId(): string {
        let id: string;
        do {
            this.openedWorkspaceCount += 1;
            id = `workspace-${this.openedWorkspaceCount}`;
        } while (this.openWorkspaces.has(id));

        return id;
    }

    private createWorkspace(id: string, spec: WorkspaceSpec): Workspace {
        const { workItemId } = spec;

        return {
            id,
            branch: spec.branch,
            root: `${FAKE_WORKTREES_DIR}/${id}`,
            runtimeDir: fakeRuntimeDir(id),
            runAgent: (request, hooks) => this.runAgent("run", { request, hooks, workItemId }),
            exec: (command, options) => this.exec({ kind: "exec", command, workItemId }, options),
            diff: (baseBranch) => {
                this.diffBaseBranches.push(baseBranch);
                return Promise.resolve(this.branchDiff);
            },
            writeFiles: (files) => {
                this.storeFiles(id, files);
                return Promise.resolve();
            },
            close: () => this.closeWorkspace(id),
        };
    }

    private async runAgent(kind: "run" | "headless", target: RunTarget): Promise<AgentRunResult> {
        this.record({ kind, nodeRunId: target.request.nodeRunId, workItemId: target.workItemId });
        this.requests.push(target.request);
        this.storeRuntimeFiles(target.request.runtimeFiles);
        const step = this.takeMatchingStep(target);

        await this.playTrackingConcurrentRuns(step, target);
        if (step?.error) {
            throw createScriptedError(step.error);
        }

        return createScriptedResult(step?.result);
    }

    private async playTrackingConcurrentRuns(
        step: ScriptedStep | undefined,
        target: RunTarget,
    ): Promise<void> {
        this.activeRunCount += 1;
        this.peakActiveRunCount = Math.max(this.peakActiveRunCount, this.activeRunCount);
        try {
            await playScriptedRun({
                clock: this.clock,
                durationMs: step?.durationMs ?? this.defaultDurationMs,
                events: step?.events ?? [],
                target,
            });
        } finally {
            this.activeRunCount -= 1;
        }
    }

    private takeMatchingStep(target: RunTarget): ScriptedStep | undefined {
        const usage = this.steps.find(
            (candidate) => candidate.remainingMatches > 0 && stepMatches(candidate.step, target),
        );
        if (!usage) {
            return undefined;
        }

        usage.remainingMatches -= 1;
        return usage.step;
    }

    private exec(
        { kind, command, workItemId }: Omit<ReceivedExec, "env" | "cwd" | "shell">,
        options: ExecOptions,
    ): Promise<ExecResult> {
        this.record({ kind, workItemId });
        const { env, cwd, shell } = options;
        this.receivedExecs.push({ kind, command, workItemId, env, cwd, shell });

        return playScriptedExec(this.clock, this.takeScriptedExec(command), options);
    }

    private takeScriptedExec(command: string): ScriptedExec {
        const executions = this.scriptedExecs.get(command) ?? [];
        const [next, ...later] = executions;
        if (later.length > 0) {
            this.scriptedExecs.set(command, later);
        }

        return next ?? SUCCESSFUL_EXEC;
    }

    private storeFiles(workspaceId: string, files: WorkspaceFile[]): void {
        const storedFiles = this.workspaceFiles.get(workspaceId) ?? new Map<string, string>();
        files.forEach((file) => storedFiles.set(file.path, file.content));
        this.workspaceFiles.set(workspaceId, storedFiles);
    }

    private storeRuntimeFiles(files: RuntimeFile[]): void {
        files.forEach((file) => this.runtimeFiles.set(file.hostPath, file.content));
    }

    private record(call: Omit<RuntimeCall, "at">): void {
        this.calls.push({ ...call, at: this.clock.now() });
    }
}

function fakeRuntimeDir(ownerId: string): RuntimeDir {
    return { host: `${FAKE_RUNTIME_DIR}/${ownerId}`, container: RUNTIME_DIR_IN_CONTAINER };
}
