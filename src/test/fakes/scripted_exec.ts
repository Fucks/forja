import {
    AgentCanceledError,
    AgentTimeoutError,
} from "@/integrations/agent_runtime/agent_errors.js";
import type { ExecOptions, ExecResult } from "@/integrations/agent_runtime/agent_runtime.js";
import type { FakeClock } from "@/test/fakes/fake_clock.js";

export interface ScriptedExec extends Omit<ExecResult, "stderrTail"> {
    stderrTail?: string;
    outputLines?: string[];
    // Past the timeoutMs of the call, the command times out like in the real workspace.
    durationMs?: number;
}

export function playScriptedExec(
    clock: FakeClock,
    execution: ScriptedExec,
    options: ExecOptions,
): Promise<ExecResult> {
    const { outputLines = [], durationMs = 0, stderrTail = "" } = execution;
    outputLines.forEach((line) => options.onOutput?.(line));
    const result = { exitCode: execution.exitCode, stdoutTail: execution.stdoutTail, stderrTail };
    if (durationMs === 0) {
        return Promise.resolve(result);
    }

    return waitForCompletion(clock, { result, durationMs, options });
}

interface PendingExec {
    result: ExecResult;
    durationMs: number;
    options: ExecOptions;
}

function waitForCompletion(
    clock: FakeClock,
    { result, durationMs, options }: PendingExec,
): Promise<ExecResult> {
    const { signal, timeoutMs } = options;

    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(new AgentCanceledError());
            return;
        }

        const isTimingOut = durationMs > timeoutMs;
        const cancelCompletion = clock.setTimeout(
            () => {
                signal.removeEventListener("abort", cancelExec);
                if (isTimingOut) {
                    reject(new AgentTimeoutError("total"));
                    return;
                }

                resolve(result);
            },
            Math.min(durationMs, timeoutMs),
        );

        function cancelExec(): void {
            cancelCompletion();
            reject(new AgentCanceledError());
        }

        signal.addEventListener("abort", cancelExec, { once: true });
    });
}
