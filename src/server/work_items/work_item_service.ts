import type { Clock } from "@/lib/clock.js";
import { newId } from "@/lib/ids.js";
import { resolveWith } from "@/lib/resolve_with.js";
import { ConflictError, DomainValidationError, NotFoundError } from "@/server/errors.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import { planGithubUpsert } from "@/server/work_items/github_issue_upsert.js";
import type { WorkItemRepository } from "@/server/work_items/work_item_repository.js";
import type {
    GithubIssueData,
    ListWorkItemsOptions,
    LocalItemInput,
    ManualColumn,
    UpdateLocalItemInput,
    WorkItem,
    WorkItemSnapshot,
} from "@/shared/work_item_types.js";

const LOCAL_BRANCH_PREFIX = "forja/item-";
const LOCAL_BRANCH_ID_LENGTH = 8;

export interface WorkItemService {
    createLocal(projectId: string, input: LocalItemInput): Promise<WorkItem>;
    /** @throws ConflictError for GitHub items, which are edited on GitHub */
    updateLocal(id: string, input: UpdateLocalItemInput): Promise<WorkItem>;
    setManualColumn(id: string, column: ManualColumn | null): Promise<WorkItem>;
    /** @throws ConflictError for GitHub items, which follow the issue on GitHub */
    archive(id: string): Promise<WorkItem>;
    list(projectId: string, opts?: ListWorkItemsOptions): Promise<WorkItem[]>;
    get(id: string): Promise<WorkItem>;
    /** True while any item of `blockedBy` is still open. */
    isBlocked(item: WorkItem, all: Map<string, WorkItem>): boolean;
    snapshots(projectId: string, ids: string[]): Promise<WorkItemSnapshot[]>;
    upsertFromGithub(projectId: string, issues: GithubIssueData[]): Promise<GithubUpsertCounts>;
}

export interface GithubUpsertCounts {
    created: number;
    updated: number;
}

export interface WorkItemServiceDeps {
    repo: WorkItemRepository;
    events: EventBus;
    clock: Clock;
}

export function createWorkItemService(deps: WorkItemServiceDeps): WorkItemService {
    const { repo } = deps;

    return {
        createLocal: (projectId, input) =>
            resolveWith(() => createLocalItem(deps, projectId, input)),
        updateLocal: (id, input) => resolveWith(() => updateLocalItem(deps, id, input)),
        setManualColumn: (id, column) => resolveWith(() => setManualColumn(deps, id, column)),
        archive: (id) => resolveWith(() => archiveLocalItem(deps, id)),
        list: (projectId, options) => resolveWith(() => listItems(repo, projectId, options)),
        get: (id) => resolveWith(() => findItemOrThrow(repo, id)),
        isBlocked: isBlockedByOpenItem,
        snapshots: (projectId, ids) => resolveWith(() => findSnapshots(repo, projectId, ids)),
        upsertFromGithub: (projectId, issues) =>
            resolveWith(() => upsertGithubIssues(deps, projectId, issues)),
    };
}

function createLocalItem(
    deps: WorkItemServiceDeps,
    projectId: string,
    input: LocalItemInput,
): WorkItem {
    assertProjectExists(deps.repo, projectId);
    const id = newId("itm");
    assertBlockersAreOtherItemsOfProject(deps.repo, { id, projectId }, input.blockedBy);

    const item = buildLocalItem({ id, projectId, input, createdAt: deps.clock.now() });
    deps.repo.insert(item);
    deps.events.publish({ type: "work_item.created", projectId, workItemId: id });

    return item;
}

function assertBlockersAreOtherItemsOfProject(
    repo: WorkItemRepository,
    item: Pick<WorkItem, "id" | "projectId">,
    blockerIds: string[],
): void {
    const isOtherItemOfProject = (blockerId: string): boolean =>
        blockerId !== item.id && repo.findById(blockerId)?.projectId === item.projectId;

    const invalidBlockerIds = blockerIds.filter((blockerId) => !isOtherItemOfProject(blockerId));
    if (invalidBlockerIds.length > 0) {
        throw new DomainValidationError(
            "Um item só pode ser bloqueado por outros itens do mesmo projeto.",
            { blockedBy: invalidBlockerIds },
        );
    }
}

function buildLocalItem(fields: {
    id: string;
    projectId: string;
    input: LocalItemInput;
    createdAt: Date;
}): WorkItem {
    const createdAt = fields.createdAt.toISOString();

    return {
        id: fields.id,
        projectId: fields.projectId,
        source: "local",
        title: fields.input.title,
        body: fields.input.body,
        labels: fields.input.labels,
        state: "open",
        blockedBy: fields.input.blockedBy,
        branch: localItemBranch(fields.id),
        archived: false,
        createdAt,
        updatedAt: createdAt,
    };
}

// The leading characters of a ULID encode its timestamp, so items created close together would share
// them; the random trailing characters keep each item on its own branch.
function localItemBranch(id: string): string {
    return `${LOCAL_BRANCH_PREFIX}${id.slice(-LOCAL_BRANCH_ID_LENGTH).toLowerCase()}`;
}

function updateLocalItem(
    deps: WorkItemServiceDeps,
    id: string,
    input: UpdateLocalItemInput,
): WorkItem {
    const item = findItemOrThrow(deps.repo, id);
    assertIsLocal(item);
    if (input.blockedBy) {
        assertBlockersAreOtherItemsOfProject(deps.repo, item, input.blockedBy);
    }

    return saveChangedItem(deps, { ...item, ...input });
}

function assertIsLocal(item: WorkItem): void {
    if (item.source === "github") {
        throw new ConflictError(
            `O item ${item.id} vem da issue #${item.number} do GitHub e só muda por lá.`,
        );
    }
}

function setManualColumn(
    deps: WorkItemServiceDeps,
    id: string,
    column: ManualColumn | null,
): WorkItem {
    const item = findItemOrThrow(deps.repo, id);

    return saveChangedItem(deps, { ...item, manualColumn: column ?? undefined });
}

function archiveLocalItem(deps: WorkItemServiceDeps, id: string): WorkItem {
    const item = findItemOrThrow(deps.repo, id);
    assertIsLocal(item);

    return saveChangedItem(deps, { ...item, archived: true });
}

function saveChangedItem(deps: WorkItemServiceDeps, changedItem: WorkItem): WorkItem {
    const item = { ...changedItem, updatedAt: deps.clock.now().toISOString() };
    deps.repo.update(item);
    deps.events.publish({
        type: "work_item.updated",
        projectId: item.projectId,
        workItemId: item.id,
    });

    return item;
}

function upsertGithubIssues(
    deps: WorkItemServiceDeps,
    projectId: string,
    issues: GithubIssueData[],
): GithubUpsertCounts {
    assertProjectExists(deps.repo, projectId);

    const plan = planGithubUpsert({
        projectId,
        issues,
        existingItems: deps.repo.listGithubItems(projectId),
        syncedAt: deps.clock.now().toISOString(),
        newItemId: () => newId("itm"),
    });
    deps.repo.saveSyncBatch({
        inserts: plan.created,
        updates: [...plan.changed, ...plan.unchanged],
    });
    publishItemEvents(deps.events, "work_item.created", plan.created);
    publishItemEvents(deps.events, "work_item.updated", plan.changed);

    return { created: plan.created.length, updated: plan.changed.length };
}

function publishItemEvents(
    events: EventBus,
    type: "work_item.created" | "work_item.updated",
    items: WorkItem[],
): void {
    for (const item of items) {
        events.publish({ type, projectId: item.projectId, workItemId: item.id });
    }
}

function listItems(
    repo: WorkItemRepository,
    projectId: string,
    options: ListWorkItemsOptions = {},
): WorkItem[] {
    assertProjectExists(repo, projectId);

    return repo.listByProject(projectId).filter((item) => matchesListOptions(item, options));
}

function matchesListOptions(item: WorkItem, options: ListWorkItemsOptions): boolean {
    const isVisible = options.includeArchived === true || !item.archived;
    const hasState = options.state === undefined || item.state === options.state;
    const hasLabel = options.label === undefined || item.labels.includes(options.label);

    return isVisible && hasState && hasLabel;
}

export function isBlockedByOpenItem(
    item: Pick<WorkItem, "blockedBy">,
    itemsById: Map<string, Pick<WorkItem, "state">>,
): boolean {
    return item.blockedBy.some((blockerId) => itemsById.get(blockerId)?.state === "open");
}

function findSnapshots(
    repo: WorkItemRepository,
    projectId: string,
    ids: string[],
): WorkItemSnapshot[] {
    return ids.map((id) => toSnapshot(findItemOfProjectOrThrow(repo, projectId, id)));
}

function toSnapshot(item: WorkItem): WorkItemSnapshot {
    const { id, title, body, number, url, labels, branch } = item;

    return { id, title, body, number, url, labels, branch };
}

function findItemOfProjectOrThrow(
    repo: WorkItemRepository,
    projectId: string,
    id: string,
): WorkItem {
    const item = findItemOrThrow(repo, id);
    if (item.projectId !== projectId) {
        throw new NotFoundError(`Item ${id} não encontrado no projeto ${projectId}.`);
    }

    return item;
}

function assertProjectExists(repo: WorkItemRepository, projectId: string): void {
    if (!repo.projectExists(projectId)) {
        throw new NotFoundError(`Projeto ${projectId} não encontrado.`);
    }
}

function findItemOrThrow(repo: WorkItemRepository, id: string): WorkItem {
    const item = repo.findById(id);
    if (!item) {
        throw new NotFoundError(`Item ${id} não encontrado.`);
    }

    return item;
}
