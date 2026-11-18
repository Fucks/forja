import { GitHubError } from "@/integrations/github/github_provider.js";
import type { GithubIssue, GitHubProvider } from "@/integrations/github/github_provider.js";
import { DomainValidationError } from "@/server/errors.js";
import type { ProjectService } from "@/server/projects/project_types.js";
import { selectSourceItems } from "@/server/runtime/executors/select_source_items.js";
import type {
    SourceCandidate,
    SourceSelection,
} from "@/server/runtime/executors/select_source_items.js";
import type { GithubOfProject } from "@/server/work_items/project_github_provider.js";
import type { WorkItemService } from "@/server/work_items/work_item_service.js";
import type { SourcePreview, SourcePreviewItem } from "@/shared/api_types.js";
import type { SourceConfig } from "@/shared/node_configs/source_config.js";
import type { WorkItem } from "@/shared/work_item_types.js";

export interface SourcePreviewDeps {
    projects: Pick<ProjectService, "get">;
    workItems: Pick<WorkItemService, "list">;
    githubOf: GithubOfProject;
}

export interface SourcePreviewer {
    /** What the Fonte would take now, without starting a run or saving any item. */
    previewSourceItems(projectId: string, sourceConfig: SourceConfig): Promise<SourcePreview>;
}

type PreviewCandidate = SourceCandidate & { preview: SourcePreviewItem };

// Blocked issues are skipped after the listing, so it reads more than the limit of the source.
const PREVIEW_ISSUE_LIMIT = 200;
const GITHUB_FAILED_MESSAGE = "Não foi possível buscar as issues do GitHub.";
const NO_GITHUB_REPO_MESSAGE = "O projeto não tem um repositório no GitHub.";
const GITHUB_CANDIDATE_ID_PREFIX = "github#";
// Issues are ordered by their number, so the creation date of a candidate is never compared.
const UNKNOWN_CREATION_DATE = "";
const NO_ITEMS = new Set<string>();

/** The items could not be read; the message is safe to show to the user. */
export class SourcePreviewFailedError extends DomainValidationError {}

export function createSourcePreviewer(deps: SourcePreviewDeps): SourcePreviewer {
    return {
        previewSourceItems: async (projectId, sourceConfig) => {
            const pool = await listCandidatePool(deps, projectId, sourceConfig);

            return summarizeSelection(selectCandidates(pool, sourceConfig));
        },
    };
}

interface CandidatePool {
    candidates: PreviewCandidate[];
    all: SourceCandidate[];
}

interface IssueReading {
    deps: SourcePreviewDeps;
    projectId: string;
    repo: string;
    config: SourceConfig;
}

function listCandidatePool(
    deps: SourcePreviewDeps,
    projectId: string,
    config: SourceConfig,
): Promise<CandidatePool> {
    if (config.provider === "local") {
        return listLocalCandidates(deps.workItems, projectId);
    }

    return listGithubCandidates(deps, projectId, config);
}

async function listGithubCandidates(
    deps: SourcePreviewDeps,
    projectId: string,
    config: SourceConfig,
): Promise<CandidatePool> {
    const project = await deps.projects.get(projectId);
    if (project.githubRepo === undefined) {
        throw new SourcePreviewFailedError(NO_GITHUB_REPO_MESSAGE);
    }

    const { listed, blockers } = await readIssuesOrFail({
        deps,
        projectId,
        repo: project.githubRepo,
        config,
    });

    return {
        candidates: listed.map(toIssueCandidate),
        all: [...listed, ...blockers].map(toIssueCandidate),
    };
}

// The message of a failed `gh` call may carry internal details, so the user gets a fixed one.
async function readIssuesOrFail({
    deps,
    projectId,
    repo,
    config,
}: IssueReading): Promise<{ listed: GithubIssue[]; blockers: GithubIssue[] }> {
    try {
        const github = await deps.githubOf(projectId);
        const listed = await github.listIssues(repo, {
            state: "open",
            label: config.label,
            limit: PREVIEW_ISSUE_LIMIT,
        });
        return { listed, blockers: await readUnlistedBlockers(github, repo, listed) };
    } catch (error) {
        if (error instanceof GitHubError) {
            throw new SourcePreviewFailedError(GITHUB_FAILED_MESSAGE);
        }
        throw error;
    }
}

// A blocker outside the listing may be closed already, which frees the issue it blocks.
function readUnlistedBlockers(
    github: GitHubProvider,
    repo: string,
    listed: GithubIssue[],
): Promise<GithubIssue[]> {
    const listedNumbers = new Set(listed.map((issue) => issue.number));
    const unlistedNumbers = new Set(
        listed
            .flatMap((issue) => issue.blockedByNumbers)
            .filter((number) => !listedNumbers.has(number)),
    );

    return Promise.all([...unlistedNumbers].map((number) => github.getIssue(repo, number)));
}

function toIssueCandidate(issue: GithubIssue): PreviewCandidate {
    return {
        id: githubCandidateId(issue.number),
        number: issue.number,
        labels: issue.labels,
        state: issue.state,
        blockedBy: issue.blockedByNumbers.map(githubCandidateId),
        createdAt: UNKNOWN_CREATION_DATE,
        preview: toIssuePreview(issue),
    };
}

function githubCandidateId(issueNumber: number): string {
    return `${GITHUB_CANDIDATE_ID_PREFIX}${issueNumber}`;
}

function toIssuePreview(issue: GithubIssue): SourcePreviewItem {
    const preview = { number: issue.number, title: issue.title, labels: issue.labels };
    if (issue.blockedByNumbers.length === 0) {
        return preview;
    }

    return { ...preview, blockedBy: issue.blockedByNumbers };
}

async function listLocalCandidates(
    workItems: SourcePreviewDeps["workItems"],
    projectId: string,
): Promise<CandidatePool> {
    const projectItems = await workItems.list(projectId);
    const localItems = projectItems.filter((item) => item.source === "local");

    return { candidates: localItems.map(toLocalCandidate), all: projectItems };
}

function toLocalCandidate(item: WorkItem): PreviewCandidate {
    return { ...item, preview: { title: item.title, labels: item.labels } };
}

function selectCandidates(
    { candidates, all }: CandidatePool,
    config: SourceConfig,
): SourceSelection<PreviewCandidate> {
    return selectSourceItems({
        candidates,
        all: new Map(all.map((candidate) => [candidate.id, candidate])),
        config,
        itemsInActiveRuns: NO_ITEMS,
        itemsWithOpenPr: NO_ITEMS,
    });
}

function summarizeSelection(selection: SourceSelection<PreviewCandidate>): SourcePreview {
    return {
        items: selection.selected.map((candidate) => candidate.preview),
        skipped: selection.excluded.filter((excluded) => excluded.reason === "blocked").length,
    };
}
