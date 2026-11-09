import { assertNever } from "@/lib/assert_never.js";
import type { Clock } from "@/lib/clock.js";
import { newId } from "@/lib/ids.js";
import { ConflictError, DomainValidationError, NotFoundError } from "@/server/errors.js";
import type { RunRepository } from "@/server/runs/run_repository.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import type { Executor } from "@/server/runtime/executor.js";
import { SerialQueueByKey } from "@/server/runtime/serial_queue_by_key.js";
import { decidePolicy } from "@/server/triggers/concurrency_policy.js";
import type { FireRequest, TriggerRepository } from "@/server/triggers/trigger_repository.js";
import type { Trigger, TriggerFire } from "@/shared/trigger_types.js";

const DISABLED_MESSAGE = "O gatilho está desativado.";
const ALL_PAUSED_MESSAGE = "Os gatilhos estão pausados.";
const ACTIVE_RUN_MESSAGE = "Já existe uma run ativa deste fluxo.";
const START_FAILED_MESSAGE = "Não foi possível iniciar a run.";

export interface FireInput {
    itemIds?: string[];
    reason: string;
}

export interface TriggerFiringDeps {
    repo: TriggerRepository;
    executor: Pick<Executor, "startRun">;
    runs: Pick<RunRepository, "listActiveRuns">;
    events: EventBus;
    clock: Clock;
}

type Unsubscribe = () => void;
type FireResult = Pick<TriggerFire, "outcome" | "runId" | "message">;

export async function fireTrigger(
    deps: TriggerFiringDeps,
    trigger: Trigger,
    input: FireInput,
): Promise<TriggerFire> {
    const firedAt = deps.clock.now().toISOString();
    const request = { reason: input.reason, itemIds: selectRunItems(trigger, input.itemIds) };
    const result = await resolveFire(deps, trigger, request);

    const fire: TriggerFire = { id: newId("trf"), triggerId: trigger.id, at: firedAt, ...result };
    deps.repo.insertFire(fire, request);
    deps.repo.setLastFiredAt(trigger.id, firedAt);
    publishFired(deps.events, trigger, fire);

    return fire;
}

// A queued fire waits for the active run of its flow to finish. Fires queued while the server was
// down find no run left to finish, so they are started right away.
export function startQueuedFiresWhenRunsFinish(deps: TriggerFiringDeps): Unsubscribe {
    const workByFlow = new SerialQueueByKey();
    const startNextOfFlow = (flowId: string): void => {
        workByFlow
            .enqueue(flowId, () => startNextQueuedFire(deps, flowId))
            .catch((error: unknown) => {
                console.error(`Falha ao iniciar o disparo enfileirado do fluxo ${flowId}`, error);
            });
    };

    const unsubscribe = deps.events.subscribe(({ event }) => {
        if (event.type === "run.finished") {
            startNextOfFlow(event.flowId);
        }
    });
    deps.repo.listFlowIdsWithQueuedFires().forEach(startNextOfFlow);

    return unsubscribe;
}

// With "source", the source node of the flow finds the items itself.
function selectRunItems(trigger: Trigger, itemIds: string[] | undefined): string[] {
    return trigger.itemSelection === "event_items" ? (itemIds ?? []) : [];
}

async function resolveFire(
    deps: TriggerFiringDeps,
    trigger: Trigger,
    request: FireRequest,
): Promise<FireResult> {
    const skipMessage = findSkipMessage(deps.repo, trigger);
    if (skipMessage) {
        return { outcome: "skipped", message: skipMessage };
    }

    const activeRunIds = await findActiveRunIdsOfFlow(deps.runs, trigger.flowId);
    const decision = decidePolicy(trigger.policy, activeRunIds);
    switch (decision) {
        case "skip":
            return { outcome: "skipped", message: ACTIVE_RUN_MESSAGE };
        case "enqueue":
            return { outcome: "queued" };
        case "start":
            return startRunOfFire(deps, trigger, request);
        default:
            return assertNever(decision);
    }
}

function findSkipMessage(repo: TriggerRepository, trigger: Trigger): string | undefined {
    if (trigger.config.kind === "manual") {
        return undefined;
    }
    if (!trigger.enabled) {
        return DISABLED_MESSAGE;
    }
    if (repo.isAllPaused()) {
        return ALL_PAUSED_MESSAGE;
    }

    return undefined;
}

async function startNextQueuedFire(deps: TriggerFiringDeps, flowId: string): Promise<void> {
    const queued = deps.repo.findOldestQueuedFireOfFlow(flowId);
    if (!queued) {
        return;
    }

    const trigger = deps.repo.findById(queued.fire.triggerId);
    if (!trigger) {
        return;
    }

    const activeRunIds = await findActiveRunIdsOfFlow(deps.runs, flowId);
    if (decidePolicy(trigger.policy, activeRunIds) !== "start") {
        return;
    }

    const result = await startRunOfFire(deps, trigger, queued.request);
    const fire: TriggerFire = { ...queued.fire, ...result };
    deps.repo.updateFireOutcome(fire);
    publishFired(deps.events, trigger, fire);

    // No run started, so no run will finish to call the next fire of the queue.
    if (fire.outcome === "error") {
        await startNextQueuedFire(deps, flowId);
    }
}

async function startRunOfFire(
    deps: TriggerFiringDeps,
    trigger: Trigger,
    request: FireRequest,
): Promise<FireResult> {
    try {
        const run = await deps.executor.startRun({
            projectId: trigger.projectId,
            flowId: trigger.flowId,
            itemIds: request.itemIds,
            triggerId: trigger.id,
        });
        return { outcome: "started", runId: run.id };
    } catch (error) {
        return { outcome: "error", message: describeStartFailure(error) };
    }
}

// Domain errors are written for the user; anything else stays in the server log.
function describeStartFailure(error: unknown): string {
    const isDomainError =
        error instanceof DomainValidationError ||
        error instanceof NotFoundError ||
        error instanceof ConflictError;
    if (isDomainError) {
        return error.message;
    }

    console.error("Falha ao iniciar a run de um gatilho", error);
    return START_FAILED_MESSAGE;
}

async function findActiveRunIdsOfFlow(
    runs: TriggerFiringDeps["runs"],
    flowId: string,
): Promise<string[]> {
    const activeRuns = await runs.listActiveRuns();

    return activeRuns.filter((run) => run.flowId === flowId).map((run) => run.id);
}

function publishFired(events: EventBus, trigger: Trigger, fire: TriggerFire): void {
    events.publish({
        type: "trigger.fired",
        projectId: trigger.projectId,
        triggerId: trigger.id,
        runId: fire.runId,
        skipped: fire.outcome === "skipped",
    });
}
