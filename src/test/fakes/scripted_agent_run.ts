import type { CancelTimeout } from "@/lib/clock.js";
import { assertNever } from "@/lib/assert_never.js";
import {
    AgentCanceledError,
    AgentRuntimeError,
    AgentTimeoutError,
    StructuredOutputError,
    UsageLimitError,
    WorkspaceError,
    type AgentTimeoutKind,
} from "@/integrations/agent_runtime/agent_errors.js";
import type {
    AgentEvent,
    AgentRunHooks,
    AgentRunRequest,
    AgentRunResult,
} from "@/integrations/agent_runtime/agent_runtime.js";
import type { FakeClock } from "@/test/fakes/fake_clock.js";

type DistributiveOmit<Union, Key extends PropertyKey> = Union extends unknown
    ? Omit<Union, Key>
    : never;

export type ScriptedEvent = DistributiveOmit<AgentEvent, "at">;

export type ScriptedError =
    | { type: "usage_limit"; resetAt?: Date }
    | { type: "timeout"; kind: AgentTimeoutKind }
    | { type: "structured_output" }
    | { type: "runtime"; message: string }
    | { type: "workspace"; message: string };

export interface ScriptedStep {
    match: { nodeRunId?: string; promptIncludes?: string; workItemId?: string };
    durationMs: number;
    events?: ScriptedEvent[];
    result?: Partial<AgentRunResult>;
    error?: ScriptedError;
    times?: number;
}

export interface RunTarget {
    request: AgentRunRequest;
    hooks: AgentRunHooks;
    workItemId?: string;
}

interface ScriptedRunPlayback {
    clock: FakeClock;
    durationMs: number;
    events: ScriptedEvent[];
    target: RunTarget;
}

const DEFAULT_SUMMARY = "ok";
const DEFAULT_INPUT_TOKENS = 1_000;
const DEFAULT_OUTPUT_TOKENS = 200;

export function stepMatches(step: ScriptedStep, { request, workItemId }: RunTarget): boolean {
    const { match } = step;
    const nodeRunMatches = match.nodeRunId === undefined || match.nodeRunId === request.nodeRunId;
    const promptMatches =
        match.promptIncludes === undefined || request.prompt.includes(match.promptIncludes);
    const workItemMatches = match.workItemId === undefined || match.workItemId === workItemId;

    return nodeRunMatches && promptMatches && workItemMatches;
}

export function playScriptedRun({
    clock,
    durationMs,
    events,
    target,
}: ScriptedRunPlayback): Promise<void> {
    const { signal } = target.request;

    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(new AgentCanceledError());
            return;
        }

        const cancelEvents = scheduleEvents({ clock, durationMs, events, target });
        const cancelCompletion = clock.setTimeout(() => {
            signal.removeEventListener("abort", cancelRun);
            resolve();
        }, durationMs);

        function cancelRun(): void {
            cancelEvents.forEach((cancelEvent) => cancelEvent());
            cancelCompletion();
            reject(new AgentCanceledError());
        }

        signal.addEventListener("abort", cancelRun, { once: true });
    });
}

function scheduleEvents({
    clock,
    durationMs,
    events,
    target,
}: ScriptedRunPlayback): CancelTimeout[] {
    const spacingMs = durationMs / (events.length + 1);

    return events.map((event, index) =>
        clock.setTimeout(
            () => target.hooks.onEvent({ ...event, at: clock.now() }),
            spacingMs * (index + 1),
        ),
    );
}

export function createScriptedError(error: ScriptedError): Error {
    switch (error.type) {
        case "usage_limit":
            return new UsageLimitError(error.resetAt);
        case "timeout":
            return new AgentTimeoutError(error.kind);
        case "structured_output":
            return new StructuredOutputError();
        case "runtime":
            return new AgentRuntimeError(error.message);
        case "workspace":
            return new WorkspaceError(error.message);
        default:
            return assertNever(error);
    }
}

export function createScriptedResult(scripted: Partial<AgentRunResult> = {}): AgentRunResult {
    return {
        summary: DEFAULT_SUMMARY,
        commits: [],
        usage: {
            inputTokens: DEFAULT_INPUT_TOKENS,
            outputTokens: DEFAULT_OUTPUT_TOKENS,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
        },
        iterations: 1,
        ...scripted,
    };
}
