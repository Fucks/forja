import { BranchInUseError } from "@/integrations/git/git_provider.js";
import type { GitProvider } from "@/integrations/git/git_provider.js";
import type { GitHubProvider } from "@/integrations/github/github_provider.js";
import type { Clock } from "@/lib/clock.js";
import type { ProjectService } from "@/server/projects/project_types.js";
import type { RunRepository } from "@/server/runs/run_repository.js";
import type { WorkItemService } from "@/server/work_items/work_item_service.js";
import type { WorkItem } from "@/shared/work_item_types.js";

const PULL_REQUEST_LOOKBACK_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOTHING_SYNCED: PullRequestSyncResult = { merged: 0, closedIssues: 0, deletedBranches: 0 };

export interface PullRequestSyncDeps {
    runs: RunRepository;
    items: WorkItemService;
    /** Already authenticated for the project (see `resolveGithubEnv`). */
    github: GitHubProvider;
    git: GitProvider;
    projects: ProjectService;
    clock: Clock;
}

export interface PullRequestSyncResult {
    merged: number;
    closedIssues: number;
    deletedBranches: number;
}

interface ProjectRepositories {
    githubRepo: string;
    localPath: string;
}

interface MergedItem {
    deps: PullRequestSyncDeps;
    repositories: ProjectRepositories;
    item: WorkItem;
}

interface SettledItem {
    hasClosedIssue: boolean;
    hasDeletedBranch: boolean;
}

/**
 * Settles the items whose pull request opened by Forja was merged: closes the issue, removes the
 * local branch and moves the item to "Concluído". @throws GitHubError when `gh` fails
 */
export async function syncPullRequests(
    projectId: string,
    deps: PullRequestSyncDeps,
): Promise<PullRequestSyncResult> {
    const project = await deps.projects.get(projectId);
    if (project.githubRepo === undefined) {
        return NOTHING_SYNCED;
    }

    const repositories = { githubRepo: project.githubRepo, localPath: project.repoPath };
    const mergedItems = await findItemsWithMergedPullRequest(deps, projectId, repositories);
    const settledItems: SettledItem[] = [];
    // One at a time: two `git branch -D` in the same repository would fight over its ref lock.
    for (const item of mergedItems) {
        settledItems.push(await settleMergedItem({ deps, repositories, item }));
    }

    return countSettledItems(settledItems);
}

async function findItemsWithMergedPullRequest(
    deps: PullRequestSyncDeps,
    projectId: string,
    repositories: ProjectRepositories,
): Promise<WorkItem[]> {
    const items = await listItemsAwaitingMerge(deps, projectId);
    const areMerged = await Promise.all(
        items.map((item) => hasMergedForjaPullRequest(deps, repositories, item)),
    );

    return items.filter((_item, index) => areMerged[index]);
}

// An item already in "Concluído" was settled by an earlier sync (or by hand), so a repeated sync
// leaves it alone.
async function listItemsAwaitingMerge(
    deps: PullRequestSyncDeps,
    projectId: string,
): Promise<WorkItem[]> {
    const [itemIdsWithPullRequest, items] = await Promise.all([
        deps.runs.listItemIdsWithArtifact(projectId, "pr_url"),
        deps.items.list(projectId),
    ]);
    const hasPullRequest = new Set(itemIdsWithPullRequest);

    return items.filter((item) => hasPullRequest.has(item.id) && item.manualColumn !== "done");
}

async function hasMergedForjaPullRequest(
    deps: PullRequestSyncDeps,
    repositories: ProjectRepositories,
    item: WorkItem,
): Promise<boolean> {
    const recentPullRequestUrls = await listRecentPullRequestUrls(deps, item.id);
    if (recentPullRequestUrls.length === 0) {
        return false;
    }

    const pullRequest = await deps.github.findPullRequestByHead(
        repositories.githubRepo,
        item.branch,
    );
    return pullRequest?.state === "merged" && recentPullRequestUrls.includes(pullRequest.url);
}

async function listRecentPullRequestUrls(
    deps: PullRequestSyncDeps,
    itemId: string,
): Promise<string[]> {
    const openedSinceMs = deps.clock.now().getTime() - PULL_REQUEST_LOOKBACK_DAYS * MS_PER_DAY;
    const nodeRuns = await deps.runs.listNodeRunsOfItem(itemId);
    const artifactsByNodeRun = await Promise.all(
        nodeRuns.map((nodeRun) => deps.runs.listArtifacts(nodeRun.id)),
    );

    return artifactsByNodeRun
        .flat()
        .filter((artifact) => artifact.kind === "pr_url")
        .filter((artifact) => new Date(artifact.createdAt).getTime() >= openedSinceMs)
        .flatMap((artifact) => (typeof artifact.value === "string" ? [artifact.value] : []));
}

// The item moves last, so a failure on GitHub or git leaves it to be settled again next round.
async function settleMergedItem({ deps, repositories, item }: MergedItem): Promise<SettledItem> {
    const hasClosedIssue = await closeIssueIfOpen(deps.github, repositories.githubRepo, item);
    const hasDeletedBranch = await deleteBranchUnlessInUse(
        deps.git,
        repositories.localPath,
        item.branch,
    );
    await deps.items.setManualColumn(item.id, "done");

    return { hasClosedIssue, hasDeletedBranch };
}

// `Closes #N` in the pull request usually closed the issue already.
async function closeIssueIfOpen(
    github: GitHubProvider,
    githubRepo: string,
    item: WorkItem,
): Promise<boolean> {
    if (item.number === undefined) {
        return false;
    }

    const issue = await github.getIssue(githubRepo, item.number);
    if (issue.state === "closed") {
        return false;
    }

    await github.closeIssue(githubRepo, item.number);
    return true;
}

// A worktree still on the branch belongs to someone working on it; the branch stays for them.
async function deleteBranchUnlessInUse(
    git: GitProvider,
    localPath: string,
    branch: string,
): Promise<boolean> {
    try {
        return await git.deleteLocalBranch(localPath, branch);
    } catch (error) {
        if (error instanceof BranchInUseError) {
            return false;
        }
        throw error;
    }
}

function countSettledItems(settledItems: SettledItem[]): PullRequestSyncResult {
    return {
        merged: settledItems.length,
        closedIssues: settledItems.filter((settled) => settled.hasClosedIssue).length,
        deletedBranches: settledItems.filter((settled) => settled.hasDeletedBranch).length,
    };
}
