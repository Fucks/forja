import type { Clock } from "@/lib/clock.js";
import { newId } from "@/lib/ids.js";
import { resolveWith } from "@/lib/resolve_with.js";
import { ConflictError, DomainValidationError, NotFoundError } from "@/server/errors.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
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
    upsertFromGithub(
        projectId: string,
        issues: GithubIssueData[],
    ): Promise<{ created: number; updated: number }>;
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
        setManualColumn: () => Promise.reject(new Error("not implemented")),
        archive: () => Promise.reject(new Error("not implemented")),
        list: () => Promise.reject(new Error("not implemented")),
        get: (id) => resolveWith(() => findItemOrThrow(repo, id)),
        isBlocked: () => false,
        snapshots: () => Promise.reject(new Error("not implemented")),
        upsertFromGithub: () => Promise.reject(new Error("not implemented")),
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

    const createdAt = deps.clock.now().toISOString();
    const item: WorkItem = {
        id,
        projectId,
        source: "local",
        title: input.title,
        body: input.body,
        labels: input.labels,
        state: "open",
        blockedBy: input.blockedBy,
        branch: localItemBranch(id),
        archived: false,
        createdAt,
        updatedAt: createdAt,
    };
    deps.repo.insert(item);
    deps.events.publish({ type: "work_item.created", projectId, workItemId: id });

    return item;
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

function assertIsLocal(item: WorkItem): void {
    if (item.source === "github") {
        throw new ConflictError(
            `O item ${item.id} vem do GitHub; edite a issue #${item.number} no GitHub.`,
        );
    }
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
