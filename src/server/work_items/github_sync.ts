import { GitHubError } from "@/integrations/github/github_provider.js";
import type { GithubIssue, GitHubProvider } from "@/integrations/github/github_provider.js";
import type { Clock } from "@/lib/clock.js";
import type { ProjectService } from "@/server/projects/project_types.js";
import type { WorkItemService } from "@/server/work_items/work_item_service.js";
import type { WorkItem } from "@/shared/work_item_types.js";

const DEFAULT_ISSUE_LIMIT = 200;
const NO_GITHUB_REPO_ERROR = "Projeto sem repositório GitHub";
const NOTHING_SYNCED: SyncCounts = { created: 0, updated: 0, closed: 0 };

export interface SyncResult {
    created: number;
    updated: number;
    closed: number;
    at: string;
    error?: string;
}

type SyncCounts = Pick<SyncResult, "created" | "updated" | "closed">;

export interface GithubSyncDeps {
    projects: ProjectService;
    items: WorkItemService;
    /** Already authenticated for the project (see `resolveGithubEnv`). */
    github: GitHubProvider;
    clock: Clock;
}

export interface GithubSyncOptions {
    label?: string;
    limit?: number;
}

interface ImportRequest {
    deps: GithubSyncDeps;
    projectId: string;
    repo: string;
    options: GithubSyncOptions;
}

/** Failures of `gh` end up in `SyncResult.error`. @throws NotFoundError for an unknown project */
export async function syncGithubIssues(
    projectId: string,
    deps: GithubSyncDeps,
    opts: GithubSyncOptions = {},
): Promise<SyncResult> {
    const at = deps.clock.now().toISOString();
    const project = await deps.projects.get(projectId);
    if (project.githubRepo === undefined) {
        return buildFailedSync(at, NO_GITHUB_REPO_ERROR);
    }

    try {
        const counts = await importIssues({
            deps,
            projectId,
            repo: project.githubRepo,
            options: opts,
        });
        return { ...counts, at };
    } catch (error) {
        if (!(error instanceof GitHubError)) {
            throw error;
        }
        return buildFailedSync(at, error.message);
    }
}

export function buildFailedSync(at: string, error: string): SyncResult {
    return { ...NOTHING_SYNCED, at, error };
}

async function importIssues(request: ImportRequest): Promise<SyncCounts> {
    const { deps, projectId } = request;
    const listedIssues = await listOpenIssues(request);
    const unlistedIssues = await readIssuesOfUnlistedOpenItems(request, listedIssues);
    const stillOpenIssues = unlistedIssues.filter((issue) => issue.state === "open");
    const closedIssues = unlistedIssues.filter((issue) => issue.state === "closed");

    const openCounts = await deps.items.upsertFromGithub(projectId, [
        ...listedIssues,
        ...stillOpenIssues,
    ]);
    const closedCounts = await deps.items.upsertFromGithub(projectId, closedIssues);

    return {
        created: openCounts.created,
        updated: openCounts.updated,
        closed: closedCounts.updated,
    };
}

function listOpenIssues({ deps, repo, options }: ImportRequest): Promise<GithubIssue[]> {
    return deps.github.listIssues(repo, {
        state: "open",
        label: options.label,
        limit: options.limit ?? DEFAULT_ISSUE_LIMIT,
    });
}

// The listing only brings open issues, so an item that is open here and missing from it may have
// been closed on GitHub (or just lost the label, or fell beyond the limit).
async function readIssuesOfUnlistedOpenItems(
    { deps, projectId, repo }: ImportRequest,
    listedIssues: GithubIssue[],
): Promise<GithubIssue[]> {
    const listedNumbers = new Set(listedIssues.map((issue) => issue.number));
    const openItems = await deps.items.list(projectId, { state: "open" });
    const unlistedNumbers = issueNumbersOf(openItems).filter(
        (number) => !listedNumbers.has(number),
    );

    return Promise.all(unlistedNumbers.map((number) => deps.github.getIssue(repo, number)));
}

function issueNumbersOf(items: WorkItem[]): number[] {
    const numbers: number[] = [];
    for (const item of items) {
        if (item.source === "github" && item.number !== undefined) {
            numbers.push(item.number);
        }
    }

    return numbers;
}
