import { validateCron, validateTimezone } from "@/engine/cron_schedule.js";
import type { ScheduleValidation } from "@/engine/cron_schedule.js";
import { newId } from "@/lib/ids.js";
import { resolveWith } from "@/lib/resolve_with.js";
import { DomainValidationError, NotFoundError } from "@/server/errors.js";
import type { CronRunner } from "@/server/triggers/cron_runner.js";
import { chainDepthOfFire, fireTrigger } from "@/server/triggers/trigger_firing.js";
import type { FireInput, TriggerFiringDeps } from "@/server/triggers/trigger_firing.js";
import type { TriggerRepository } from "@/server/triggers/trigger_repository.js";
import { generateWebhookToken } from "@/server/triggers/webhook_tokens.js";
import type {
    Trigger,
    TriggerConfig,
    TriggerConfigInput,
    TriggerFire,
    TriggerWithToken,
} from "@/shared/trigger_types.js";

const NOT_A_WEBHOOK_MESSAGE = "O gatilho não é um webhook.";
const WEBHOOK_NEEDS_NEW_TRIGGER_MESSAGE =
    "Para usar um webhook, crie um novo gatilho: o token é gerado na criação.";

export type TriggerInput = Omit<Trigger, "id" | "createdAt" | "lastFiredAt" | "config"> & {
    config: TriggerConfigInput;
};
export type TriggerPatch = Partial<
    Pick<Trigger, "name" | "enabled" | "policy" | "itemSelection"> & { config: TriggerConfigInput }
>;

type StoredTriggerInput = Omit<TriggerInput, "config"> & { config: TriggerConfig };

export interface TriggerService {
    /**
     * A webhook trigger comes with its token, which is never shown again.
     * @throws DomainValidationError when the flow is not of the project or the schedule is invalid
     */
    create(input: TriggerInput): Promise<Trigger | TriggerWithToken>;
    update(id: string, patch: TriggerPatch): Promise<Trigger>;
    remove(id: string): Promise<void>;
    /** The previous token stops working. @throws DomainValidationError when not a webhook */
    rotateWebhookToken(id: string): Promise<TriggerWithToken>;
    list(projectId: string, opts?: { kind?: Trigger["config"]["kind"] }): Promise<Trigger[]>;
    fire(id: string, input: FireInput): Promise<TriggerFire>;
    /** How many event triggers in a row led to the run; 0 when no event trigger started it. */
    chainDepthOfRun(runId: string): Promise<number>;
    /** Newest fire first. */
    history(id: string, limit: number): Promise<TriggerFire[]>;
    /** A paused trigger records its fires as skipped; manual triggers always run. */
    setAllPaused(paused: boolean): Promise<void>;
    isAllPaused(): Promise<boolean>;
}

export interface TriggerServiceDeps extends TriggerFiringDeps {
    cronRunner: Pick<CronRunner, "reschedule">;
}

export function createTriggerService(deps: TriggerServiceDeps): TriggerService {
    const { repo } = deps;

    return {
        create: (input) => rescheduleAfter(deps, () => createTrigger(deps, input)),
        update: (id, patch) => rescheduleAfter(deps, () => updateTrigger(repo, id, patch)),
        remove: async (id) => {
            await rescheduleAfter(deps, () => removeTrigger(repo, id));
        },
        rotateWebhookToken: (id) => resolveWith(() => rotateWebhookToken(repo, id)),
        list: (projectId, options) =>
            resolveWith(() => listTriggers(repo, projectId, options?.kind)),
        fire: (id, input) => fireFoundTrigger(deps, id, input),
        chainDepthOfRun: (runId) =>
            resolveWith(() => chainDepthOfFire(repo.findFireByRunId(runId))),
        history: (id, limit) => resolveWith(() => listHistory(repo, id, limit)),
        setAllPaused: (paused) => resolveWith(() => repo.setAllPaused(paused)),
        isAllPaused: () => resolveWith(() => repo.isAllPaused()),
    };
}

async function rescheduleAfter<ChangedTrigger extends Trigger>(
    deps: TriggerServiceDeps,
    changeTrigger: () => ChangedTrigger,
): Promise<ChangedTrigger> {
    const trigger = await resolveWith(changeTrigger);
    await deps.cronRunner.reschedule(trigger.id);

    return trigger;
}

function createTrigger(deps: TriggerServiceDeps, input: TriggerInput): Trigger | TriggerWithToken {
    assertProjectExists(deps.repo, input.projectId);
    assertFlowBelongsToProject(deps.repo, input);
    if (input.config.kind === "webhook") {
        return createWebhookTrigger(deps, input);
    }

    return insertTrigger(deps, { ...input, config: input.config });
}

function createWebhookTrigger(deps: TriggerServiceDeps, input: TriggerInput): TriggerWithToken {
    const { token, hash } = generateWebhookToken();
    const trigger = insertTrigger(deps, { ...input, config: { kind: "webhook", tokenHash: hash } });

    return { ...trigger, token };
}

function insertTrigger(deps: TriggerServiceDeps, input: StoredTriggerInput): Trigger {
    assertValidSchedule(input.config);

    const trigger = { ...input, id: newId("trg"), createdAt: deps.clock.now().toISOString() };
    deps.repo.insert(trigger);

    return trigger;
}

function updateTrigger(repo: TriggerRepository, id: string, patch: TriggerPatch): Trigger {
    const current = findTriggerOrThrow(repo, id);
    const config = patch.config ? patchConfig(current.config, patch.config) : current.config;
    const trigger = { ...current, ...patch, config };
    assertValidSchedule(trigger.config);
    repo.update(trigger);

    return trigger;
}

// A webhook keeps its token through updates; a token is only made on creation or rotation.
function patchConfig(current: TriggerConfig, patched: TriggerConfigInput): TriggerConfig {
    if (patched.kind !== "webhook") {
        return patched;
    }
    if (current.kind !== "webhook") {
        throw new DomainValidationError(WEBHOOK_NEEDS_NEW_TRIGGER_MESSAGE);
    }

    return current;
}

function rotateWebhookToken(repo: TriggerRepository, id: string): TriggerWithToken {
    const current = findTriggerOrThrow(repo, id);
    if (current.config.kind !== "webhook") {
        throw new DomainValidationError(NOT_A_WEBHOOK_MESSAGE);
    }

    const { token, hash } = generateWebhookToken();
    const trigger: Trigger = { ...current, config: { kind: "webhook", tokenHash: hash } };
    repo.update(trigger);

    return { ...trigger, token };
}

function removeTrigger(repo: TriggerRepository, id: string): Trigger {
    const trigger = findTriggerOrThrow(repo, id);
    repo.delete(id);

    return trigger;
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

async function fireFoundTrigger(
    deps: TriggerServiceDeps,
    id: string,
    input: FireInput,
): Promise<TriggerFire> {
    const trigger = await resolveWith(() => findTriggerOrThrow(deps.repo, id));

    return fireTrigger(deps, trigger, input);
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

function assertValidSchedule(config: TriggerConfig): void {
    if (config.kind !== "schedule") {
        return;
    }

    throwIfInvalid(validateCron(config.cron));
    throwIfInvalid(validateTimezone(config.timezone));
}

function throwIfInvalid(validation: ScheduleValidation): void {
    if (!validation.ok) {
        throw new DomainValidationError(validation.message);
    }
}

function findTriggerOrThrow(repo: TriggerRepository, id: string): Trigger {
    const trigger = repo.findById(id);
    if (!trigger) {
        throw new NotFoundError(`Gatilho ${id} não encontrado.`);
    }

    return trigger;
}
