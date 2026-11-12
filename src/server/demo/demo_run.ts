import { RUN_TERMINAL } from "@/engine/run_state.js";
import { createScriptedAgentRuntime } from "@/integrations/agent_runtime/scripted_agent_runtime.js";
import type { Clock } from "@/lib/clock.js";
import type { AppServices } from "@/server/demo/seed_demo.js";
import type { RunRecord } from "@/server/runs/run_repository.js";
import { SqliteRunRepository } from "@/server/runs/sqlite_run_repository.js";
import { createAppExecutor } from "@/server/runtime/app_executor.js";
import type { StartRunInput } from "@/server/runtime/executor.js";

const DEMO_RUN_SPEED = 50;
const RUN_POLL_INTERVAL_MS = 100;
const DEMO_RUN_TIMEOUT_MS = 120_000;

export class DemoRunFailedError extends Error {
    override readonly name = "DemoRunFailedError";

    constructor(run: RunRecord) {
        super(`A run da demonstração terminou como ${run.status}.`);
    }
}

export class DemoRunTimeoutError extends Error {
    override readonly name = "DemoRunTimeoutError";

    constructor(runId: string) {
        super(`A run ${runId} da demonstração não terminou a tempo.`);
    }
}

/**
 * Plays the run with simulated agents at high speed, whatever runtime the server uses, so the demo
 * starts with real NodeRuns, logs and usage.
 */
export async function runDemoFlowToTheEnd(deps: AppServices, input: StartRunInput): Promise<void> {
    const executor = createAppExecutor({
        ...deps,
        runtime: createScriptedAgentRuntime({ clock: deps.clock, speed: DEMO_RUN_SPEED }),
    });
    const run = await executor.startRun(input);
    const finished = await waitForRunToFinish(deps, run.id);
    if (finished.status !== "SUCCEEDED") {
        throw new DemoRunFailedError(finished);
    }
}

async function waitForRunToFinish(deps: AppServices, runId: string): Promise<RunRecord> {
    const runs = new SqliteRunRepository(deps.db, deps.clock);
    const deadlineMs = deps.clock.now().getTime() + DEMO_RUN_TIMEOUT_MS;
    while (deps.clock.now().getTime() < deadlineMs) {
        const run = await runs.getRun(runId);
        if (run && RUN_TERMINAL.has(run.status)) {
            return run;
        }
        await sleep(deps.clock, RUN_POLL_INTERVAL_MS);
    }

    throw new DemoRunTimeoutError(runId);
}

function sleep(clock: Clock, ms: number): Promise<void> {
    return new Promise((resolve) => {
        clock.setTimeout(resolve, ms);
    });
}
