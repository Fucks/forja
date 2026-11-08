import type { GithubIssueData, WorkItem } from "@/shared/work_item_types.js";

const GITHUB_BRANCH_PREFIX = "forja/issue-";

export interface GithubUpsertRequest {
    projectId: string;
    issues: GithubIssueData[];
    existingItems: WorkItem[];
    syncedAt: string;
    newItemId: () => string;
}

export interface GithubUpsertPlan {
    created: WorkItem[];
    changed: WorkItem[];
    unchanged: WorkItem[];
}

interface IssueWithId {
    issue: GithubIssueData;
    id: string;
}

interface IssueWithItem {
    issue: GithubIssueData;
    item: WorkItem;
}

interface ResyncedItem {
    item: WorkItem;
    hasChanged: boolean;
}

type SyncedFields = Pick<
    WorkItem,
    "number" | "url" | "title" | "body" | "labels" | "state" | "blockedBy"
>;

export function planGithubUpsert(request: GithubUpsertRequest): GithubUpsertPlan {
    const existingByNumber = indexByNumber(request.existingItems);
    const newIssues = assignIdsToNewIssues(request, existingByNumber);
    const knownIssues = pairWithExistingItems(request.issues, existingByNumber);
    const idByNumber = indexIdsByNumber(existingByNumber, newIssues);

    const created = newIssues.map((newIssue) => buildGithubItem(request, newIssue, idByNumber));
    const synced = knownIssues.map((known) => resyncItem(request, known, idByNumber));

    return {
        created,
        changed: synced.filter((result) => result.hasChanged).map((result) => result.item),
        unchanged: synced.filter((result) => !result.hasChanged).map((result) => result.item),
    };
}

function indexByNumber(items: WorkItem[]): Map<number, WorkItem> {
    const itemsByNumber = new Map<number, WorkItem>();
    for (const item of items) {
        if (item.number !== undefined) {
            itemsByNumber.set(item.number, item);
        }
    }

    return itemsByNumber;
}

function assignIdsToNewIssues(
    request: GithubUpsertRequest,
    existingByNumber: Map<number, WorkItem>,
): IssueWithId[] {
    return request.issues
        .filter((issue) => !existingByNumber.has(issue.number))
        .map((issue) => ({ issue, id: request.newItemId() }));
}

function pairWithExistingItems(
    issues: GithubIssueData[],
    existingByNumber: Map<number, WorkItem>,
): IssueWithItem[] {
    return issues.flatMap((issue) => {
        const item = existingByNumber.get(issue.number);
        return item ? [{ issue, item }] : [];
    });
}

// New issues get their ids before any item is built, so an issue can be blocked by another issue
// of the same batch no matter which of them comes first.
function indexIdsByNumber(
    existingByNumber: Map<number, WorkItem>,
    newIssues: IssueWithId[],
): Map<number, string> {
    const existingIds = [...existingByNumber].map(([number, item]): [number, string] => [
        number,
        item.id,
    ]);
    const newIds = newIssues.map(({ issue, id }): [number, string] => [issue.number, id]);

    return new Map([...existingIds, ...newIds]);
}

function buildGithubItem(
    request: GithubUpsertRequest,
    newIssue: IssueWithId,
    idByNumber: Map<number, string>,
): WorkItem {
    return {
        ...toSyncedFields(newIssue.issue, idByNumber),
        id: newIssue.id,
        projectId: request.projectId,
        source: "github",
        branch: `${GITHUB_BRANCH_PREFIX}${newIssue.issue.number}`,
        archived: false,
        createdAt: request.syncedAt,
        updatedAt: request.syncedAt,
        syncedAt: request.syncedAt,
    };
}

function resyncItem(
    request: GithubUpsertRequest,
    known: IssueWithItem,
    idByNumber: Map<number, string>,
): ResyncedItem {
    const syncedFields = toSyncedFields(known.issue, idByNumber);
    const syncedItem = { ...known.item, syncedAt: request.syncedAt };
    if (hasSameSyncedFields(known.item, syncedFields)) {
        return { item: syncedItem, hasChanged: false };
    }

    const changedItem = { ...syncedItem, ...syncedFields, updatedAt: request.syncedAt };
    return { item: changedItem, hasChanged: true };
}

function toSyncedFields(issue: GithubIssueData, idByNumber: Map<number, string>): SyncedFields {
    return {
        number: issue.number,
        url: issue.url,
        title: issue.title,
        body: issue.body,
        labels: issue.labels,
        state: issue.state,
        blockedBy: resolveBlockerIds(issue.blockedByNumbers, idByNumber),
    };
}

// A blocker that was never synced (another repository, a deleted issue) is unknown to the Forja.
function resolveBlockerIds(blockerNumbers: number[], idByNumber: Map<number, string>): string[] {
    return blockerNumbers.flatMap((number) => {
        const blockerId = idByNumber.get(number);
        return blockerId === undefined ? [] : [blockerId];
    });
}

function hasSameSyncedFields(item: WorkItem, syncedFields: SyncedFields): boolean {
    return (
        item.url === syncedFields.url &&
        item.title === syncedFields.title &&
        item.body === syncedFields.body &&
        item.state === syncedFields.state &&
        haveSameEntries(item.labels, syncedFields.labels) &&
        haveSameEntries(item.blockedBy, syncedFields.blockedBy)
    );
}

function haveSameEntries(first: string[], second: string[]): boolean {
    return first.length === second.length && first.every((entry, index) => entry === second[index]);
}
