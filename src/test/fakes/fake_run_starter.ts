import type { Clock } from "@/lib/clock.js";
import { newId } from "@/lib/ids.js";
import type { RunRecord } from "@/server/runs/run_repository.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import type { Executor, StartRunInput } from "@/server/runtime/executor.js";
import { runLifecycleEvent } from "@/server/runtime/run_events.js";
import { InMemoryRunRepository } from "@/test/fakes/in_memory_run_repository.js";

// Stands in for the executor: a started run stays RUNNING until the test finishes it.
export class FakeRunStarter implements Pick<Executor, "startRun"> {
    readonly runs = new InMemoryRunRepository();
    readonly startedRuns: StartRunInput[] = [];
    private nextStartError?: Error;

    constructor(
        private readonly events: EventBus,
        private readonly clock: Clock,
    ) {}

    async startRun(input: StartRunInput): Promise<RunRecord> {
        const startError = this.nextStartError;
        this.nextStartError = undefined;
        if (startError) {
            throw startError;
        }

        const run = this.buildRunningRun(input);
        await this.runs.createRun(run);
        this.startedRuns.push(input);

        return run;
    }

    failNextStart(error: Error): void {
        this.nextStartError = error;
    }

    async finishRun(runId: string): Promise<void> {
        const run = await this.runs.getRun(runId);
        if (!run) {
            throw new Error(`Run ${runId} was never started`);
        }

        const finishedRun: RunRecord = {
            ...run,
            status: "SUCCEEDED",
            finishedAt: this.clock.now(),
        };
        await this.runs.saveTransition({ run: finishedRun });
        this.events.publish(runLifecycleEvent("run.finished", finishedRun));
    }

    private buildRunningRun(input: StartRunInput): RunRecord {
        const now = this.clock.now();

        return {
            id: newId("run"),
            projectId: input.projectId,
            flowId: input.flowId,
            flowVersion: input.version ?? 1,
            status: "RUNNING",
            createdAt: now,
            startedAt: now,
            triggerId: input.triggerId,
            itemIds: input.itemIds,
            failedItemIds: [],
        };
    }
}
