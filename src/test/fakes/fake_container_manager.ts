import {
    AgentCanceledError,
    AgentTimeoutError,
} from "@/integrations/agent_runtime/agent_errors.js";
import type {
    ContainerExecOptions,
    ContainerExecResult,
    ContainerManager,
    ContainerSummary,
} from "@/integrations/agent_runtime/container_manager.js";
import type { LineListener } from "@/integrations/process/command_runner.js";
import type { CancelTimeout } from "@/lib/clock.js";
import type { FakeClock } from "@/test/fakes/fake_clock.js";

export interface ScriptedExec {
    stdoutLines: string[];
    /** Clock time before each line, and before the end after the last one. */
    lineDelayMs?: number;
    exitCode?: number;
    stderrTail?: string;
    /** Never ends by itself: only an abort or the exec timeout finishes it. */
    hangsAfterLines?: boolean;
}

export interface RecordedExec {
    containerId: string;
    command: string[];
    options: ContainerExecOptions;
}

export type CommandMatcher = (command: string[]) => boolean;

interface ExecScript {
    matches: CommandMatcher;
    executions: ScriptedExec[];
}

const UNSCRIPTED_EXEC_EXIT_CODE = 127;
const FAKE_CONTAINER_ID = "fake-container";

export class FakeContainerManager implements ContainerManager {
    readonly execs: RecordedExec[] = [];
    private scripts: ExecScript[] = [];

    constructor(private readonly clock: FakeClock) {}

    /** The executions answer the matching calls in order; the last one answers all the rest. */
    whenExec(matches: CommandMatcher, ...executions: ScriptedExec[]): void {
        this.scripts = [{ matches, executions }, ...this.scripts];
    }

    start(): Promise<{ id: string }> {
        return Promise.resolve({ id: FAKE_CONTAINER_ID });
    }

    exec(
        containerId: string,
        command: string[],
        options: ContainerExecOptions,
    ): Promise<ContainerExecResult> {
        this.execs.push({ containerId, command, options });
        const execution = this.nextExecutionFor(command);
        if (!execution) {
            return Promise.resolve(unscriptedResult(command));
        }

        return replayScriptedExec(this.clock, execution, options);
    }

    stop(): Promise<void> {
        return Promise.resolve();
    }

    list(): Promise<ContainerSummary[]> {
        return Promise.resolve([]);
    }

    private nextExecutionFor(command: string[]): ScriptedExec | undefined {
        const script = this.scripts.find((candidate) => candidate.matches(command));
        if (!script) {
            return undefined;
        }

        const [next, ...rest] = script.executions;
        if (rest.length > 0) {
            script.executions = rest;
        }

        return next;
    }
}

function replayScriptedExec(
    clock: FakeClock,
    execution: ScriptedExec,
    options: ContainerExecOptions,
): Promise<ContainerExecResult> {
    if (options.signal.aborted) {
        return Promise.reject(new AgentCanceledError());
    }

    return new Promise((resolve, reject) => {
        const timers: CancelTimeout[] = [];
        const settle = (outcome: () => void): void => {
            timers.forEach((cancelTimer) => cancelTimer());
            options.signal.removeEventListener("abort", cancel);
            outcome();
        };
        const cancel = (): void => settle(() => reject(new AgentCanceledError()));
        const timeOut = (): void => settle(() => reject(new AgentTimeoutError("total")));

        options.signal.addEventListener("abort", cancel);
        timers.push(...scheduleLines(clock, execution, options.onStdoutLine));
        timers.push(clock.setTimeout(timeOut, options.timeoutMs));
        if (!execution.hangsAfterLines) {
            const end = (): void => settle(() => resolve(resultOf(execution)));
            timers.push(clock.setTimeout(end, endDelayMs(execution)));
        }
    });
}

function scheduleLines(
    clock: FakeClock,
    execution: ScriptedExec,
    onLine: LineListener | undefined,
): CancelTimeout[] {
    return execution.stdoutLines.map((line, index) =>
        clock.setTimeout(() => onLine?.(line), lineDelayMsOf(execution) * (index + 1)),
    );
}

function endDelayMs(execution: ScriptedExec): number {
    return lineDelayMsOf(execution) * (execution.stdoutLines.length + 1);
}

function lineDelayMsOf(execution: ScriptedExec): number {
    return execution.lineDelayMs ?? 0;
}

function resultOf(execution: ScriptedExec): ContainerExecResult {
    return {
        exitCode: execution.exitCode ?? 0,
        stdoutTail: execution.stdoutLines.join("\n"),
        stderrTail: execution.stderrTail ?? "",
    };
}

function unscriptedResult(command: string[]): ContainerExecResult {
    return {
        exitCode: UNSCRIPTED_EXEC_EXIT_CODE,
        stdoutTail: "",
        stderrTail: `FakeContainerManager: no script for ${command.join(" ")}`,
    };
}
