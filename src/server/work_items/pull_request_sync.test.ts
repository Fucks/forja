import type { GithubPullRequestState } from "@/integrations/github/github_provider.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { createProjectService } from "@/server/projects/project_service.js";
import { createEventBus } from "@/server/runtime/event_bus.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import { syncPullRequests } from "@/server/work_items/pull_request_sync.js";
import type { PullRequestSyncDeps } from "@/server/work_items/pull_request_sync.js";
import { WorkItemRepository } from "@/server/work_items/work_item_repository.js";
import { createWorkItemService } from "@/server/work_items/work_item_service.js";
import type { ForjaEvent } from "@/shared/events.js";
import type { WorkItem } from "@/shared/work_item_types.js";
import { buildNodeRunState } from "@/test/factories/node_run_state_factory.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { buildArtifactRecord, buildRunRecord } from "@/test/factories/run_record_factory.js";
import { buildGithubIssue, buildWorkItem } from "@/test/factories/work_item_factory.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { FakeGitHubProvider } from "@/test/fakes/fake_github_provider.js";
import { FakeGitProvider } from "@/test/fakes/fake_git_provider.js";
import { InMemoryRunRepository } from "@/test/fakes/in_memory_run_repository.js";
import { createTestDb } from "@/test/test_db.js";

const NOW = new Date("2026-11-12T12:00:00Z");
const TWO_DAYS_AGO = "2026-11-10T12:00:00.000Z";
const FORTY_DAYS_AGO = "2026-10-03T12:00:00.000Z";
const PROJECT_ID = "prj_forja";
const LOCAL_PROJECT_ID = "prj_local";
const REPO = "Fucks/forja";
const REPO_PATH = "/repos/forja";
const ISSUE_NUMBER = 7;
const BRANCH = "forja/issue-7";
const PR_NUMBER = 1007;
const PR_URL = `https://github.com/${REPO}/pull/${PR_NUMBER}`;
const NOTHING_SYNCED = { merged: 0, closedIssues: 0, deletedBranches: 0 };

interface PullRequestOptions {
    state: GithubPullRequestState;
    url?: string;
}

describe("syncPullRequests", () => {
    let database: DatabaseHandle;
    let events: EventBus;
    let runs: InMemoryRunRepository;
    let github: FakeGitHubProvider;
    let git: FakeGitProvider;
    let deps: PullRequestSyncDeps;

    beforeEach(() => {
        database = createTestDb();
        const projectRepo = new ProjectRepository(database.db);
        projectRepo.insert(buildProject({ id: PROJECT_ID, githubRepo: REPO, repoPath: REPO_PATH }));
        projectRepo.insert(buildProject({ id: LOCAL_PROJECT_ID }));
        const clock = new FakeClock(NOW);
        events = createEventBus(clock);
        runs = new InMemoryRunRepository();
        github = new FakeGitHubProvider();
        git = new FakeGitProvider();
        git.addRepo(
            { root: REPO_PATH, currentBranch: "main", defaultBranch: "main" },
            { branches: [BRANCH] },
        );
        deps = {
            runs,
            items: createWorkItemService({
                repo: new WorkItemRepository(database.db),
                events,
                clock,
            }),
            github,
            git,
            projects: createProjectService({
                repo: projectRepo,
                git,
                fileExists: () => false,
                clock,
            }),
            clock,
        };
    });

    afterEach(() => {
        database.close();
    });

    function insertItem(overrides: Partial<WorkItem> = {}): WorkItem {
        const item = buildWorkItem({ projectId: PROJECT_ID, branch: BRANCH, ...overrides });
        new WorkItemRepository(database.db).insert(item);
        return item;
    }

    async function recordPrUrlArtifact(
        item: WorkItem,
        artifact: { url: string; createdAt: string },
    ): Promise<void> {
        const runId = `run_${item.id}_${artifact.createdAt}`;
        const nodeRunId = `nr_${runId}`;
        await runs.createRun(buildRunRecord({ id: runId, projectId: item.projectId }));
        await runs.saveTransition({
            nodeRuns: [buildNodeRunState({ id: nodeRunId, runId, workItemId: item.id })],
            artifacts: [
                buildArtifactRecord({
                    id: `art_${runId}`,
                    nodeRunId,
                    runId,
                    name: "pr_url",
                    kind: "pr_url",
                    value: artifact.url,
                    createdAt: artifact.createdAt,
                }),
            ],
        });
    }

    function addPullRequest({ state, url = PR_URL }: PullRequestOptions): void {
        github.addPullRequest(REPO, {
            number: PR_NUMBER,
            url,
            state,
            headBranch: BRANCH,
            baseBranch: "main",
        });
    }

    async function insertItemWithForjaPullRequest(
        state: GithubPullRequestState,
    ): Promise<WorkItem> {
        const item = insertItem();
        github.addIssue(REPO, buildGithubIssue({ number: ISSUE_NUMBER }));
        await recordPrUrlArtifact(item, { url: PR_URL, createdAt: TWO_DAYS_AGO });
        addPullRequest({ state });
        return item;
    }

    async function issueState(): Promise<string> {
        return (await github.getIssue(REPO, ISSUE_NUMBER)).state;
    }

    function publishedEvents(): ForjaEvent[] {
        return events.since(0).map((envelope) => envelope.event);
    }

    describe("when the pull request opened by Forja was merged", () => {
        it("moves the item to Concluído", async () => {
            const item = await insertItemWithForjaPullRequest("merged");

            await syncPullRequests(PROJECT_ID, deps);

            expect((await deps.items.get(item.id)).manualColumn).toBe("done");
        });

        it("closes the issue that is still open", async () => {
            await insertItemWithForjaPullRequest("merged");

            await syncPullRequests(PROJECT_ID, deps);

            expect(await issueState()).toBe("closed");
        });

        it("removes the local branch of the item", async () => {
            await insertItemWithForjaPullRequest("merged");

            await syncPullRequests(PROJECT_ID, deps);

            expect(await git.branchExists(REPO_PATH, BRANCH)).toBe(false);
        });

        it("publishes work_item.updated for the item", async () => {
            const item = await insertItemWithForjaPullRequest("merged");

            await syncPullRequests(PROJECT_ID, deps);

            expect(publishedEvents()).toContainEqual({
                type: "work_item.updated",
                projectId: PROJECT_ID,
                workItemId: item.id,
            });
        });

        it("answers what it did", async () => {
            await insertItemWithForjaPullRequest("merged");

            const result = await syncPullRequests(PROJECT_ID, deps);

            expect(result).toEqual({ merged: 1, closedIssues: 1, deletedBranches: 1 });
        });

        it("leaves an issue already closed by the merge alone", async () => {
            await insertItemWithForjaPullRequest("merged");
            await github.closeIssue(REPO, ISSUE_NUMBER);

            const result = await syncPullRequests(PROJECT_ID, deps);

            expect(result).toEqual({ merged: 1, closedIssues: 0, deletedBranches: 1 });
        });

        it("moves a local item without an issue to close", async () => {
            const item = insertItem({ source: "local", number: undefined, url: undefined });
            await recordPrUrlArtifact(item, { url: PR_URL, createdAt: TWO_DAYS_AGO });
            addPullRequest({ state: "merged" });

            const result = await syncPullRequests(PROJECT_ID, deps);

            expect(result).toEqual({ merged: 1, closedIssues: 0, deletedBranches: 1 });
            expect((await deps.items.get(item.id)).manualColumn).toBe("done");
        });

        it("keeps a branch held by an active worktree and still moves the item", async () => {
            const item = await insertItemWithForjaPullRequest("merged");
            git.holdBranchInWorktree(BRANCH);

            const result = await syncPullRequests(PROJECT_ID, deps);

            expect(result).toEqual({ merged: 1, closedIssues: 1, deletedBranches: 0 });
            expect((await deps.items.get(item.id)).manualColumn).toBe("done");
        });
    });

    it("does nothing more when synced again", async () => {
        await insertItemWithForjaPullRequest("merged");
        await syncPullRequests(PROJECT_ID, deps);
        const eventsAfterFirstSync = publishedEvents().length;

        const result = await syncPullRequests(PROJECT_ID, deps);

        expect(result).toEqual(NOTHING_SYNCED);
        expect(publishedEvents()).toHaveLength(eventsAfterFirstSync);
    });

    it("leaves the item alone when the pull request was closed without merge", async () => {
        const item = await insertItemWithForjaPullRequest("closed");

        const result = await syncPullRequests(PROJECT_ID, deps);

        expect(result).toEqual(NOTHING_SYNCED);
        expect((await deps.items.get(item.id)).manualColumn).toBeUndefined();
        expect(await issueState()).toBe("open");
        expect(await git.branchExists(REPO_PATH, BRANCH)).toBe(true);
    });

    it("leaves the item alone while the pull request is open", async () => {
        await insertItemWithForjaPullRequest("open");

        const result = await syncPullRequests(PROJECT_ID, deps);

        expect(result).toEqual(NOTHING_SYNCED);
    });

    it("ignores a merged pull request of the branch that Forja did not open", async () => {
        const item = insertItem();
        await recordPrUrlArtifact(item, { url: PR_URL, createdAt: TWO_DAYS_AGO });
        addPullRequest({ state: "merged", url: `https://github.com/${REPO}/pull/2000` });

        const result = await syncPullRequests(PROJECT_ID, deps);

        expect(result).toEqual(NOTHING_SYNCED);
    });

    it("ignores pull requests opened more than 30 days ago", async () => {
        const item = insertItem();
        await recordPrUrlArtifact(item, { url: PR_URL, createdAt: FORTY_DAYS_AGO });
        addPullRequest({ state: "merged" });

        const result = await syncPullRequests(PROJECT_ID, deps);

        expect(result).toEqual(NOTHING_SYNCED);
    });

    it("syncs nothing for a project without a GitHub repository", async () => {
        const result = await syncPullRequests(LOCAL_PROJECT_ID, deps);

        expect(result).toEqual(NOTHING_SYNCED);
    });
});
