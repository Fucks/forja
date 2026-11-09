import { assertNever } from "@/lib/assert_never.js";
import type { Clock } from "@/lib/clock.js";
import { newId } from "@/lib/ids.js";
import { resolveWith } from "@/lib/resolve_with.js";
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

export type TriggerInput = Omit<Trigger, "id" | "createdAt" | "lastFiredAt">;
export type TriggerPatch = Partial<
    Pick<Trigger, "name" | "enabled" | "policy" | "config" | "itemSelection">
>;
export interface FireInput {
    itemIds?: string[];
    reason: string;
}

export interface TriggerService {
    /** @throws DomainValidationError when the flow is not of the project */
    create(input: TriggerInput): Promise<Trigger>;
    update(id: string, patch: TriggerPatch): Promise<Trigger>;
    remove(id: string): Promise<void>;
    list(projectId: string, opts?: { kind?: Trigger["config"]["kind"] }): Promise<Trigger[]>;
    fire(id: string, input: FireInput): Promise<TriggerFire>;
    /** Newest fire first. */
    history(id: string, limit: number): Promise<TriggerFire[]>;
    /** A paused trigger records its fires as skipped; manual triggers always run. */
    setAllPaused(paused: boolean): Promise<void>;
    isAllPaused(): Promise<boolean>;
}

export interface TriggerServiceDeps {
    repo: TriggerRepository;
    executor: Pick<Executor, "startRun">;
    runs: Pick<RunRepository, "listActiveRuns">;
    events: EventBus;
    clock: Clock;
}

type Unsubscribe = () => void;
type FireResult = Pick<TriggerFire, "outcome" | "runId" | "message">;

export function createTriggerService(deps: TriggerServiceDeps): TriggerService {
    const { repo } = deps;

    return {
        create: (input) => resolveWith(() => createTrigger(deps, input)),
        update: (id, patch) => resolveWith(() => updateTrigger(repo, id, patch)),
        remove: (id) => resolveWith(() => removeTrigger(repo, id)),
        list: (projectId, options) =>
            resolveWith(() => listTriggers(repo, projectId, options?.kind)),
        fire: (id, input) => fireTrigger(deps, id, input),
        history: (id, limit) => resolveWith(() => listHistory(repo, id, limit)),
        setAllPaused: (paused) => resolveWith(() => repo.setAllPaused(paused)),
        isAllPaused: () => resolveWith(() => repo.isAllPaused()),
    };
}

// A queued fire waits for the active run of its flow to finish. Fires queued while the server was
// down find no run left to finish, so they are started right away.
export function startQueuedFiresWhenRunsFinish(deps: TriggerServiceDeps): Unsubscribe {
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

function createTrigger(deps: TriggerServiceDeps, input: TriggerInput): Trigger {
    assertProjectExists(deps.repo, input.projectId);
    assertFlowBelongsToProject(deps.repo, input);

    const trigger = { ...input, id: newId("trg"), createdAt: deps.clock.now().toISOString() };
    deps.repo.insert(trigger);

    return trigger;
}

function updateTrigger(repo: TriggerRepository, id: string, patch: TriggerPatch): Trigger {
    const trigger = { ...findTriggerOrThrow(repo, id), ...patch };
    repo.update(trigger);

    return trigger;
}

function removeTrigger(repo: TriggerRepository, id: string): void {
    findTriggerOrThrow(repo, id);
    repo.delete(id);
}

function listTriggers(
    repo: TriggerRepository,
    projectId: string,
    kind: Trigger["config"]["kind"] | undefined,
): Trigger[] {
    assertProjectExists(repo, projectId);

    return repo.listByProject(projectId, kind);
}

function listHistory(repo: TriggerRepository, id: string, limit: number): TriggerFire[] {
    findTriggerOrThrow(repo, id);

    return repo.listFiresNewestFirst(id, limit);
}

async function fireTrigger(
    deps: TriggerServiceDeps,
    id: string,
    input: FireInput,
): Promise<TriggerFire> {
    const trigger = findTriggerOrThrow(deps.repo, id);
    const request = { reason: input.reason, itemIds: selectRunItems(trigger, input.itemIds) };

    const fire = { ...newFire(deps, trigger), ...(await resolveFire(deps, trigger, request)) };
    deps.repo.insertFire(fire, request);
    deps.repo.update({ ...trigger, lastFiredAt: fire.at });
    publishFired(deps.events, trigger, fire);

    return fire;
}

// With "source", the source node of the flow finds the items itself.
function selectRunItems(trigger: Trigger, itemIds: string[] | undefined): string[] {
    return trigger.itemSelection === "event_items" ? (itemIds ?? []) : [];
}

async function resolveFire(
    deps: TriggerServiceDeps,
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

async function startNextQueuedFire(deps: TriggerServiceDeps, flowId: string): Promise<void> {
    const queued = deps.repo.findOldestQueuedFireOfFlow(flowId);
    if (!queued) {
        return;
    }

    const trigger = findTriggerOrThrow(deps.repo, queued.fire.triggerId);
    const activeRunIds = await findActiveRunIdsOfFlow(deps.runs, flowId);
    if (decidePolicy(trigger.policy, activeRunIds) !== "start") {
        return;
    }

    const fire = { ...queued.fire, ...(await startRunOfFire(deps, trigger, queued.request)) };
    deps.repo.updateFireOutcome(fire);
    publishFired(deps.events, trigger, fire);

    // No run started, so no run will finish to call the next fire of the queue.
    if (fire.outcome === "error") {
        await startNextQueuedFire(deps, flowId);
    }
}

async function startRunOfFire(
    deps: TriggerServiceDeps,
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
    runs: TriggerServiceDeps["runs"],
    flowId: string,
): Promise<string[]> {
    const activeRuns = await runs.listActiveRuns();

    return activeRuns.filter((run) => run.flowId === flowId).map((run) => run.id);
}

function newFire(
    deps: TriggerServiceDeps,
    trigger: Trigger,
): Pick<TriggerFire, "id" | "triggerId" | "at"> {
    return { id: newId("trf"), triggerId: trigger.id, at: deps.clock.now().toISOString() };
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

function assertProjectExists(repo: TriggerRepository, projectId: string): void {
    if (!repo.projectExists(projectId)) {
        throw new NotFoundError(`Projeto ${projectId} não encontrado.`);
    }
}

function assertFlowBelongsToProject(repo: TriggerRepository, input: TriggerInput): void {
    if (!repo.flowBelongsToProject(input.flowId, input.projectId)) {
        throw new DomainValidationError(
            `O fluxo ${input.flowId} não pertence ao projeto ${input.projectId}.`,
        );
    }
}

function findTriggerOrThrow(repo: TriggerRepository, id: string): Trigger {
    const trigger = repo.findById(id);
    if (!trigger) {
        throw new NotFoundError(`Gatilho ${id} não encontrado.`);
    }

    return trigger;
}
