import { AgentCanceledError } from "@/integrations/agent_runtime/agent_errors.js";
import type {
    AgentRunHooks,
    AgentRunRequest,
    AgentRunResult,
} from "@/integrations/agent_runtime/agent_runtime.js";
import { minimalValueForSchema } from "@/integrations/agent_runtime/minimal_schema_value.js";
import type { CancelTimeout, Clock } from "@/lib/clock.js";
import { createSeededRandom, type SeededRandom } from "@/lib/seeded_random.js";
import type { DemoScript, DemoToolCall } from "@/server/demo/demo_script.js";
import type { TokenUsage } from "@/shared/usage_types.js";

export interface ScriptedRunSettings {
    clock: Clock;
    /** 1 plays each run in 3–8 s; 50 plays it 50 times faster. */
    speed: number;
    script: DemoScript;
}

type PlannedEvent =
    { kind: "text"; text: string } | { kind: "tool_call"; name: string; args: string };

interface ScriptedRunPlan {
    durationMs: number;
    events: PlannedEvent[];
    result: AgentRunResult;
}

interface PlanPlayback {
    clock: Clock;
    plan: ScriptedRunPlan;
    signal: AbortSignal;
    hooks: AgentRunHooks;
}

const MIN_RUN_MS = 3_000;
const MAX_RUN_MS = 8_000;
const MAX_EXTRA_READS = 2;
const SCRIPTED_ITERATION = 1;
const TOKEN_RANGES: Record<keyof TokenUsage, [number, number]> = {
    inputTokens: [2_000, 20_000],
    outputTokens: [300, 3_000],
    cacheReadInputTokens: [0, 50_000],
    cacheCreationInputTokens: [0, 5_000],
};

/** The same NodeRun always plays the same events, duration and usage. */
export function playScriptedAgentRun(
    settings: ScriptedRunSettings,
    request: AgentRunRequest,
    hooks: AgentRunHooks,
): Promise<AgentRunResult> {
    const plan = planScriptedRun(settings, request);

    return playPlan({ clock: settings.clock, plan, signal: request.signal, hooks });
}

function planScriptedRun(
    { speed, script }: ScriptedRunSettings,
    request: AgentRunRequest,
): ScriptedRunPlan {
    const random = createSeededRandom(request.nodeRunId);
    const durationMs = random.integerBetween(MIN_RUN_MS, MAX_RUN_MS) / speed;
    const events = planEvents(random, script);
    const summary = random.pickOne(script.summaries);

    return {
        durationMs,
        events: [...events, { kind: "text", text: summary }],
        result: {
            output: outputFor(request),
            summary,
            commits: [],
            usage: randomTokenUsage(random),
            iterations: SCRIPTED_ITERATION,
            completionSignal: request.completionSignal,
        },
    };
}

// Reads like an agent at work: looks around, says what it found, edits and runs the tests.
function planEvents(random: SeededRandom, script: DemoScript): PlannedEvent[] {
    const extraReads = Array.from({ length: random.integerBetween(0, MAX_EXTRA_READS) }, () =>
        random.pickOne(script.reads),
    );

    return [
        { kind: "text", text: random.pickOne(script.openings) },
        toolCallEvent(random.pickOne(script.searches)),
        toolCallEvent(random.pickOne(script.reads)),
        ...extraReads.map(toolCallEvent),
        { kind: "text", text: random.pickOne(script.findings) },
        toolCallEvent(random.pickOne(script.edits)),
        toolCallEvent(random.pickOne(script.verifications)),
    ];
}

function toolCallEvent(toolCall: DemoToolCall): PlannedEvent {
    return { kind: "tool_call", name: toolCall.name, args: JSON.stringify(toolCall.args) };
}

function outputFor(request: AgentRunRequest): unknown {
    if (request.outputSchema === undefined) {
        return undefined;
    }

    return minimalValueForSchema(request.outputSchema);
}

function randomTokenUsage(random: SeededRandom): TokenUsage {
    const between = ([min, max]: [number, number]): number => random.integerBetween(min, max);

    return {
        inputTokens: between(TOKEN_RANGES.inputTokens),
        outputTokens: between(TOKEN_RANGES.outputTokens),
        cacheReadInputTokens: between(TOKEN_RANGES.cacheReadInputTokens),
        cacheCreationInputTokens: between(TOKEN_RANGES.cacheCreationInputTokens),
    };
}

function playPlan({ clock, plan, signal, hooks }: PlanPlayback): Promise<AgentRunResult> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(new AgentCanceledError());
            return;
        }

        const cancelEvents = scheduleEvents({ clock, plan, signal, hooks });
        const cancelCompletion = clock.setTimeout(() => {
            signal.removeEventListener("abort", cancelRun);
            resolve(plan.result);
        }, plan.durationMs);

        function cancelRun(): void {
            cancelEvents.forEach((cancelEvent) => cancelEvent());
            cancelCompletion();
            reject(new AgentCanceledError());
        }

        signal.addEventListener("abort", cancelRun, { once: true });
    });
}

// Evenly spaced, the last one before the run ends.
function scheduleEvents({ clock, plan, hooks }: PlanPlayback): CancelTimeout[] {
    const spacingMs = plan.durationMs / (plan.events.length + 1);

    return plan.events.map((event, index) =>
        clock.setTimeout(
            () => hooks.onEvent({ ...event, at: clock.now(), iteration: SCRIPTED_ITERATION }),
            spacingMs * (index + 1),
        ),
    );
}
