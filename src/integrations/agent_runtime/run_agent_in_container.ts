import type {
    AgentContainer,
    RunAgentInContainer,
} from "@/integrations/agent_runtime/agent_container.js";
import { isIterationFailure, toAgentFailure } from "@/integrations/agent_runtime/agent_failure.js";
import type {
    AgentRunHooks,
    AgentRunRequest,
    AgentRunResult,
} from "@/integrations/agent_runtime/agent_runtime.js";
import {
    runClaudeIteration,
    type ClaudeIteration,
} from "@/integrations/agent_runtime/claude_iteration.js";
import { addUsage, EMPTY_USAGE } from "@/integrations/agent_runtime/claude_result.js";
import { readStructuredOutput } from "@/integrations/agent_runtime/output_schema.js";
import {
    startRunDeadlines,
    type RunDeadlines,
} from "@/integrations/agent_runtime/run_deadlines.js";
import type { Clock } from "@/lib/clock.js";

export type { RunAgentInContainer } from "@/integrations/agent_runtime/agent_container.js";

export interface RunAgentInContainerDeps {
    clock: Clock;
}

interface AgentRun {
    clock: Clock;
    container: AgentContainer;
    request: AgentRunRequest;
    hooks: AgentRunHooks;
    deadlines: RunDeadlines;
}

interface FinishedIteration extends ClaudeIteration {
    madeCommits: boolean;
}

const SUMMARY_MAX_CHARS = 4_000;
const MS_PER_SECOND = 1_000;

/** Runs Claude Code in the container: one or more iterations, each in a clean context. */
export function createRunAgentInContainer(deps: RunAgentInContainerDeps): RunAgentInContainer {
    return async (container, request, hooks) => {
        const deadlines = startRunDeadlines({
            clock: deps.clock,
            userSignal: request.signal,
            timeoutMs: request.timeoutMs,
            idleTimeoutMs: request.idleTimeoutSeconds * MS_PER_SECOND,
        });

        try {
            return await runIterations({ clock: deps.clock, container, request, hooks, deadlines });
        } catch (error) {
            throw deadlines.explainInterruption(error);
        } finally {
            deadlines.clear();
        }
    };
}

async function runIterations(run: AgentRun): Promise<AgentRunResult> {
    const headAtStart = await run.container.commits?.readHead();
    const iterations: FinishedIteration[] = [];

    for (let iteration = 1; iteration <= run.request.maxIterations; iteration += 1) {
        const finished = await runIteration(run, iteration);
        iterations.push(finished);
        if (isIterationFailure(finished) && !canRecoverFrom(run.request, finished)) {
            throw toAgentFailure(finished, run.clock.now());
        }
        if (!shouldRunAnotherIteration(run.request, finished)) {
            break;
        }
    }

    return {
        ...summarizeIterations(run.request, iterations),
        commits: await commitsSince(run.container, headAtStart),
    };
}

async function runIteration(run: AgentRun, iteration: number): Promise<FinishedIteration> {
    const headBefore = await run.container.commits?.readHead();
    const finished = await runClaudeIteration({ ...run, iteration });
    const newCommits = await commitsSince(run.container, headBefore);

    return { ...finished, madeCommits: newCommits.length > 0 };
}

function shouldRunAnotherIteration(
    request: AgentRunRequest,
    iteration: FinishedIteration,
): boolean {
    if (!hasIterationsLeft(request, iteration)) {
        return false;
    }

    return isIterationFailure(iteration) || !isWorkComplete(request, iteration);
}

// Hitting the turn limit leaves the work half done, and a clean context can pick it up. Without a
// completion signal, only an iteration that left no commits behind is started over.
function canRecoverFrom(request: AgentRunRequest, iteration: FinishedIteration): boolean {
    if (!hasIterationsLeft(request, iteration) || iteration.result?.subtype !== "error_max_turns") {
        return false;
    }

    return request.completionSignal !== undefined || !iteration.madeCommits;
}

function hasIterationsLeft(request: AgentRunRequest, iteration: ClaudeIteration): boolean {
    return iteration.iteration < request.maxIterations;
}

// Without a completion signal, the first iteration that succeeds is the answer.
function isWorkComplete(request: AgentRunRequest, iteration: ClaudeIteration): boolean {
    const { completionSignal } = request;
    if (completionSignal === undefined) {
        return true;
    }

    return iteration.agentTexts.some((text) => text.includes(completionSignal));
}

function summarizeIterations(
    request: AgentRunRequest,
    iterations: FinishedIteration[],
): Omit<AgentRunResult, "commits"> {
    const last = iterations.at(-1);
    const usage = iterations
        .map((iteration) => iteration.result?.usage ?? EMPTY_USAGE)
        .reduce(addUsage, EMPTY_USAGE);

    return {
        output: structuredOutputOf(request, last),
        summary: summaryOf(last),
        usage,
        sessionId: last?.result?.sessionId,
        iterations: iterations.length,
        completionSignal: completionSignalFound(request, last),
    };
}

function structuredOutputOf(request: AgentRunRequest, last: ClaudeIteration | undefined): unknown {
    if (!request.outputSchema) {
        return undefined;
    }

    return readStructuredOutput(request.outputSchema, last?.result);
}

function summaryOf(last: ClaudeIteration | undefined): string {
    const lastText = last?.result?.text ?? last?.lastAssistantText ?? "";
    return lastText.slice(0, SUMMARY_MAX_CHARS);
}

function completionSignalFound(
    request: AgentRunRequest,
    last: ClaudeIteration | undefined,
): string | undefined {
    if (request.completionSignal === undefined || !last || !isWorkComplete(request, last)) {
        return undefined;
    }

    return request.completionSignal;
}

async function commitsSince(
    container: AgentContainer,
    sha: string | undefined,
): Promise<{ sha: string }[]> {
    if (!container.commits || sha === undefined) {
        return [];
    }

    return container.commits.listCommitsSince(sha);
}
