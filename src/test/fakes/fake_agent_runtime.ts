import { AgentCanceledError } from "@/integrations/agent_runtime/agent_errors.js";
import type {
    AgentRunHooks,
    AgentRunRequest,
    AgentRunResult,
    AgentRuntime,
    ExecResult,
    HeadlessSpec,
    OpenWorkspaceSummary,
    Workspace,
    WorkspaceFile,
    WorkspaceSpec,
} from "@/integrations/agent_runtime/agent_runtime.js";
import type { FakeClock } from "@/test/fakes/fake_clock.js";
import {
    createScriptedError,
    createScriptedResult,
    playScriptedRun,
    stepMatches,
    type RunTarget,
    type ScriptedStep,
} from "@/test/fakes/scripted_agent_run.js";

export type {
    ScriptedError,
    ScriptedEvent,
    ScriptedStep,
} from "@/test/fakes/scripted_agent_run.js";

export interface FakeAgentRuntimeOptions {
    clock: FakeClock;
    steps?: ScriptedStep[];
    defaultDurationMs?: number;
}

export interface RuntimeCall {
    kind: "open" | "run" | "headless" | "exec" | "close";
    nodeRunId?: string;
    workItemId?: string;
    at: Date;
}

interface ScriptedStepUsage {
    step: ScriptedStep;
    remainingMatches: number;
}

const DEFAULT_DURATION_MS = 1_000;
const WORKSPACE_READY_MESSAGE = "workspace pronto";
const SUCCESSFUL_EXEC: ExecResult = { exitCode: 0, stdoutTail: "" };
const FAKE_WORKTREES_DIR = "/fake/worktrees";

export class FakeAgentRuntime implements AgentRuntime {
    readonly calls: RuntimeCall[] = [];
    private readonly clock: FakeClock;
    private readonly defaultDurationMs: number;
    private readonly steps: ScriptedStepUsage[] = [];
    private readonly execResults = new Map<string, ExecResult>();
    private readonly openWorkspaces = new Map<string, OpenWorkspaceSummary>();
    private readonly workspaceFiles = new Map<string, Map<string, string>>();
    private openedWorkspaceCount = 0;
    private activeRunCount = 0;
    private peakActiveRunCount = 0;

    constructor({
        clock,
        steps = [],
        defaultDurationMs = DEFAULT_DURATION_MS,
    }: FakeAgentRuntimeOptions) {
        this.clock = clock;
        this.defaultDurationMs = defaultDurationMs;
        steps.forEach((step) => this.script(step));
    }

    script(step: ScriptedStep): this {
        this.steps.push({ step, remainingMatches: step.times ?? Infinity });
        return this;
    }

    scriptExec(command: string, result: ExecResult): this {
        this.execResults.set(command, result);
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
        if (signal.aborted) {
            return Promise.reject(new AgentCanceledError());
        }

        this.openedWorkspaceCount += 1;
        const id = `workspace-${this.openedWorkspaceCount}`;
        this.openWorkspaces.set(id, { id, runId: spec.runId, workItemId: spec.workItemId });
        this.storeFiles(id, spec.files);
        hooks.onEvent({ kind: "system", message: WORKSPACE_READY_MESSAGE, at: this.clock.now() });

        return Promise.resolve(this.createWorkspace(id, spec));
    }

    runHeadless(
        spec: HeadlessSpec,
        request: AgentRunRequest,
        hooks: AgentRunHooks,
    ): Promise<AgentRunResult> {
        return this.runAgent("headless", { request, hooks, workItemId: spec.workItemId });
    }

    listOpenWorkspaces(): Promise<OpenWorkspaceSummary[]> {
        return Promise.resolve([...this.openWorkspaces.values()]);
    }

    closeWorkspace(id: string): Promise<void> {
        this.record({ kind: "close", workItemId: this.openWorkspaces.get(id)?.workItemId });
        this.openWorkspaces.delete(id);

        return Promise.resolve();
    }

    private createWorkspace(id: string, spec: WorkspaceSpec): Workspace {
        const { workItemId } = spec;

        return {
            id,
            branch: spec.branch,
            root: `${FAKE_WORKTREES_DIR}/${id}`,
            runAgent: (request, hooks) => this.runAgent("run", { request, hooks, workItemId }),
            exec: (command) => this.exec(command, workItemId),
            diff: () => Promise.resolve(""),
            writeFiles: (files) => {
                this.storeFiles(id, files);
                return Promise.resolve();
            },
            close: () => this.closeWorkspace(id),
        };
    }

    private async runAgent(kind: "run" | "headless", target: RunTarget): Promise<AgentRunResult> {
        this.record({ kind, nodeRunId: target.request.nodeRunId, workItemId: target.workItemId });
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

    private exec(command: string, workItemId: string): Promise<ExecResult> {
        this.record({ kind: "exec", workItemId });

        return Promise.resolve(this.execResults.get(command) ?? SUCCESSFUL_EXEC);
    }

    private storeFiles(workspaceId: string, files: WorkspaceFile[]): void {
        const storedFiles = this.workspaceFiles.get(workspaceId) ?? new Map<string, string>();
        files.forEach((file) => storedFiles.set(file.path, file.content));
        this.workspaceFiles.set(workspaceId, storedFiles);
    }

    private record(call: Omit<RuntimeCall, "at">): void {
        this.calls.push({ ...call, at: this.clock.now() });
    }
}
