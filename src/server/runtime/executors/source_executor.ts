import type { GitHubProvider } from "@/integrations/github/github_provider.js";
import type { Clock } from "@/lib/clock.js";
import type { ProjectService } from "@/server/projects/project_types.js";
import type { RunRecord, RunRepository } from "@/server/runs/run_repository.js";
import { asNodeOfType } from "@/server/runtime/executors/node_of_type.js";
import {
    selectSourceItems,
    type SourceSelection,
} from "@/server/runtime/executors/select_source_items.js";
import type {
    NodeExecutionContext,
    NodeExecutionResult,
    NodeExecutor,
} from "@/server/runtime/node_executors.js";
import { syncGithubIssues } from "@/server/work_items/github_sync.js";
import type { GithubOfProject } from "@/server/work_items/project_github_provider.js";
import type { WorkItemService } from "@/server/work_items/work_item_service.js";
import type { SourceConfig } from "@/shared/node_configs/source_config.js";
import type { Project } from "@/shared/project_types.js";
import type { WorkItem } from "@/shared/work_item_types.js";

const SOURCE_ITEMS_PORT = "items";
// The drawer of the NodeRun reads it to show why each item was left out.
const SOURCE_SELECTION_ARTIFACT = "source_selection";

export interface SourceExecutorDeps {
    workItems: WorkItemService;
    runs: RunRepository;
    projects: ProjectService;
    clock: Clock;
    githubOf: GithubOfProject;
}

export class GithubSyncFailedError extends Error {
    override readonly name = "GithubSyncFailedError";

    constructor(reason: string) {
        super(`Não foi possível sincronizar as issues do GitHub: ${reason}`);
    }
}

export function createSourceExecutor(deps: SourceExecutorDeps): NodeExecutor {
    return async (context) => {
        const { config } = asNodeOfType(context.node, "source");
        if (config.provider === "github") {
            await syncIssuesOfProject(deps, context.project.id, config);
        }

        const selection = await selectItemsOfRun(deps, context, config);
        return buildSourceResult(deps.workItems, context.project.id, selection);
    };
}

// Selecting from the items of an earlier sync could deliver an issue closed since then.
async function syncIssuesOfProject(
    deps: SourceExecutorDeps,
    projectId: string,
    config: SourceConfig,
): Promise<void> {
    const github = await deps.githubOf(projectId);
    const syncDeps = { projects: deps.projects, items: deps.workItems, github, clock: deps.clock };
    const result = await syncGithubIssues(projectId, syncDeps, { label: config.label });
    if (result.error !== undefined) {
        throw new GithubSyncFailedError(result.error);
    }
}

async function selectItemsOfRun(
    deps: SourceExecutorDeps,
    context: NodeExecutionContext,
    config: SourceConfig,
): Promise<SourceSelection> {
    const projectItems = await deps.workItems.list(context.project.id);
    const requestedIds = requestedIdsOf(context);
    const candidates = candidatesOf(projectItems, config, requestedIds);
    const [itemsInActiveRuns, itemsWithOpenPr] = await Promise.all([
        findItemsInOtherActiveRuns(deps.runs, context.run),
        findItemsWithOpenPr(deps, context.project, candidates),
    ]);

    return selectSourceItems({
        candidates,
        all: new Map(projectItems.map((item) => [item.id, item])),
        config,
        requestedIds,
        itemsInActiveRuns,
        itemsWithOpenPr,
    });
}

// A run without items (manual, schedule) takes whatever the provider has.
function requestedIdsOf(context: NodeExecutionContext): string[] | undefined {
    if (context.runItems.length === 0) {
        return undefined;
    }

    return context.runItems.map((item) => item.id);
}

// The items chosen on the board may come from any provider.
function candidatesOf(
    projectItems: WorkItem[],
    config: SourceConfig,
    requestedIds: string[] | undefined,
): WorkItem[] {
    if (requestedIds !== undefined) {
        return projectItems;
    }

    return projectItems.filter((item) => item.source === config.provider);
}

async function findItemsInOtherActiveRuns(
    runs: RunRepository,
    currentRun: RunRecord,
): Promise<Set<string>> {
    const activeRuns = await runs.listActiveRuns();
    const otherRunsOfProject = activeRuns.filter(
        (run) => run.projectId === currentRun.projectId && run.id !== currentRun.id,
    );
    const itemIdsPerRun = await Promise.all(
        otherRunsOfProject.map((run) => listItemIdsOfRun(runs, run)),
    );

    return new Set(itemIdsPerRun.flat());
}

// A run started by a source has no items of its own; they show up in its NodeRuns.
async function listItemIdsOfRun(runs: RunRepository, run: RunRecord): Promise<string[]> {
    const nodeRuns = await runs.listNodeRuns(run.id);
    const nodeRunItemIds = nodeRuns.flatMap((nodeRun) =>
        nodeRun.workItemId === undefined ? [] : [nodeRun.workItemId],
    );

    return [...run.itemIds, ...nodeRunItemIds];
}

async function findItemsWithOpenPr(
    deps: SourceExecutorDeps,
    project: Project,
    candidates: WorkItem[],
): Promise<Set<string>> {
    const repo = project.githubRepo;
    if (repo === undefined) {
        return new Set();
    }

    const itemIdsWithPr = new Set(await deps.runs.listItemIdsWithArtifact(project.id, "pr_url"));
    const candidatesWithPr = candidates.filter((item) => itemIdsWithPr.has(item.id));
    if (candidatesWithPr.length === 0) {
        return new Set();
    }

    const github = await deps.githubOf(project.id);
    const pullRequestChecks = await Promise.all(
        candidatesWithPr.map(async (item) => ({
            itemId: item.id,
            isOpen: await hasOpenPullRequest(github, repo, item),
        })),
    );

    return new Set(pullRequestChecks.filter(({ isOpen }) => isOpen).map(({ itemId }) => itemId));
}

async function hasOpenPullRequest(
    github: GitHubProvider,
    repo: string,
    item: WorkItem,
): Promise<boolean> {
    const pullRequest = await github.findPullRequestByHead(repo, item.branch);
    return pullRequest?.state === "open";
}

async function buildSourceResult(
    workItems: WorkItemService,
    projectId: string,
    selection: SourceSelection,
): Promise<NodeExecutionResult> {
    const selectedIds = selection.selected.map((item) => item.id);
    const snapshots = await workItems.snapshots(projectId, selectedIds);

    return {
        outputs: { [SOURCE_ITEMS_PORT]: snapshots },
        artifacts: [
            {
                name: SOURCE_SELECTION_ARTIFACT,
                kind: "json",
                value: { selectedIds, excluded: selection.excluded },
            },
        ],
    };
}
