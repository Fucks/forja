import { newId } from "@/lib/ids.js";
import { resolveWith } from "@/lib/resolve_with.js";
import { DomainValidationError, NotFoundError } from "@/server/errors.js";
import { fireTrigger } from "@/server/triggers/trigger_firing.js";
import type { FireInput, TriggerFiringDeps } from "@/server/triggers/trigger_firing.js";
import type { TriggerRepository } from "@/server/triggers/trigger_repository.js";
import type { Trigger, TriggerFire } from "@/shared/trigger_types.js";

export type TriggerInput = Omit<Trigger, "id" | "createdAt" | "lastFiredAt">;
export type TriggerPatch = Partial<
    Pick<Trigger, "name" | "enabled" | "policy" | "config" | "itemSelection">
>;

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

export type TriggerServiceDeps = TriggerFiringDeps;

export function createTriggerService(deps: TriggerServiceDeps): TriggerService {
    const { repo } = deps;

    return {
        create: (input) => resolveWith(() => createTrigger(deps, input)),
        update: (id, patch) => resolveWith(() => updateTrigger(repo, id, patch)),
        remove: (id) => resolveWith(() => removeTrigger(repo, id)),
        list: (projectId, options) =>
            resolveWith(() => listTriggers(repo, projectId, options?.kind)),
        fire: (id, input) => fireFoundTrigger(deps, id, input),
        history: (id, limit) => resolveWith(() => listHistory(repo, id, limit)),
        setAllPaused: (paused) => resolveWith(() => repo.setAllPaused(paused)),
        isAllPaused: () => resolveWith(() => repo.isAllPaused()),
    };
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

function findTriggerOrThrow(repo: TriggerRepository, id: string): Trigger {
    const trigger = repo.findById(id);
    if (!trigger) {
        throw new NotFoundError(`Gatilho ${id} não encontrado.`);
    }

    return trigger;
}
