import { z } from "zod";

import type { DatabaseHandle } from "@/server/db/client.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { createProjectService } from "@/server/projects/project_service.js";
import type { RunRecord } from "@/server/runs/run_repository.js";
import { createEventBus } from "@/server/runtime/event_bus.js";
import { selectSourceItems } from "@/server/runtime/executors/select_source_items.js";
import {
    createSourceExecutor,
    GithubSyncFailedError,
} from "@/server/runtime/executors/source_executor.js";
import type { NodeExecutionResult, NodeExecutor } from "@/server/runtime/node_executors.js";
import { WorkItemRepository } from "@/server/work_items/work_item_repository.js";
import {
    createWorkItemService,
    type WorkItemService,
} from "@/server/work_items/work_item_service.js";
import { type SourceConfig, sourceConfigSchema } from "@/shared/node_configs/source_config.js";
import type { Project } from "@/shared/project_types.js";
import type { WorkItem, WorkItemSnapshot } from "@/shared/work_item_types.js";
import { createNodeOfType } from "@/test/factories/flow_graph_factory.js";
import { buildNodeExecutionContext } from "@/test/factories/node_execution_context_factory.js";
import { buildNodeRunState } from "@/test/factories/node_run_state_factory.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { buildArtifactRecord, buildRunRecord } from "@/test/factories/run_record_factory.js";
import {
    buildGithubIssue,
    buildLocalItemInput,
    buildWorkItem,
} from "@/test/factories/work_item_factory.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { FakeGitHubProvider } from "@/test/fakes/fake_github_provider.js";
import { FakeGitProvider } from "@/test/fakes/fake_git_provider.js";
import { InMemoryRunRepository } from "@/test/fakes/in_memory_run_repository.js";
import { createTestDb } from "@/test/test_db.js";

const SANDCASTLE_LABEL = "Sandcastle";
const GITHUB_SOURCE = sourceConfigSchema.parse({ provider: "github", label: SANDCASTLE_LABEL });
const LOCAL_SOURCE = sourceConfigSchema.parse({ provider: "local" });
const REPO = "Fucks/forja";
const GITHUB_PROJECT = buildProject({ id: "prj_github", githubRepo: REPO });
const LOCAL_PROJECT = buildProject({ id: "prj_local" });
const SOURCE_POSITION = { x: 0, y: 0 };
const CURRENT_RUN_ID = "run_current";
const OTHER_RUN_ID = "run_other";
const EARLIER_RUN_ID = "run_earlier";

const sourceSelectionArtifactSchema = z.object({
    name: z.literal("source_selection"),
    value: z.object({
        selectedIds: z.array(z.string()),
        excluded: z.array(z.object({ itemId: z.string(), reason: z.string() })),
    }),
});
type SourceSelectionArtifact = z.infer<typeof sourceSelectionArtifactSchema>["value"];

describe("selectSourceItems", () => {
    it("selects the open items with the label", () => {
        const issue = buildIssueItem(1);

        const selection = select([issue]);

        expect(selection).toEqual({ selected: [issue], excluded: [] });
    });

    it("excludes closed items", () => {
        const closed = buildIssueItem(1, { state: "closed" });

        const selection = select([closed]);

        expect(selection.excluded).toEqual([{ itemId: closed.id, reason: "closed" }]);
    });

    it("excludes items without the label of the source", () => {
        const unlabeled = buildIssueItem(1, { labels: [] });

        const selection = select([unlabeled]);

        expect(selection.excluded).toEqual([{ itemId: unlabeled.id, reason: "label" }]);
    });

    it("selects items with any label when the source has none", () => {
        const unlabeled = buildIssueItem(1, { labels: [] });

        const selection = select([unlabeled], { config: { ...GITHUB_SOURCE, label: undefined } });

        expect(selection.selected).toEqual([unlabeled]);
    });

    it("excludes items blocked by an open item", () => {
        const blocker = buildIssueItem(1);
        const blocked = buildIssueItem(2, { blockedBy: [blocker.id] });

        const selection = select([blocker, blocked]);

        expect(selection.selected).toEqual([blocker]);
        expect(selection.excluded).toEqual([{ itemId: blocked.id, reason: "blocked" }]);
    });

    it("selects items whose blockers are all closed", () => {
        const closedBlocker = buildIssueItem(1, { state: "closed" });
        const unblocked = buildIssueItem(2, { blockedBy: [closedBlocker.id] });

        const selection = select([closedBlocker, unblocked]);

        expect(selection.selected).toEqual([unblocked]);
    });

    it("selects blocked items when the source does not skip them", () => {
        const blocker = buildIssueItem(1);
        const blocked = buildIssueItem(2, { blockedBy: [blocker.id] });

        const selection = select([blocker, blocked], {
            config: { ...GITHUB_SOURCE, skipBlocked: false },
        });

        expect(selection.selected).toEqual([blocker, blocked]);
    });

    it("looks for the blockers among all the items of the project", () => {
        const blockerWithoutLabel = buildIssueItem(1, { labels: [] });
        const blocked = buildIssueItem(2, { blockedBy: [blockerWithoutLabel.id] });

        const selection = selectSourceItems({
            ...emptyContext(),
            candidates: [blocked],
            all: itemsById([blockerWithoutLabel, blocked]),
            config: GITHUB_SOURCE,
        });

        expect(selection.excluded).toEqual([{ itemId: blocked.id, reason: "blocked" }]);
    });

    it("excludes items being processed by another active run", () => {
        const inOtherRun = buildIssueItem(1);

        const selection = select([inOtherRun], { itemsInActiveRuns: new Set([inOtherRun.id]) });

        expect(selection.excluded).toEqual([{ itemId: inOtherRun.id, reason: "in_other_run" }]);
    });

    it("excludes items that already have an open pull request", () => {
        const withOpenPr = buildIssueItem(1);

        const selection = select([withOpenPr], { itemsWithOpenPr: new Set([withOpenPr.id]) });

        expect(selection.excluded).toEqual([{ itemId: withOpenPr.id, reason: "has_open_pr" }]);
    });

    it("gives each excluded item only the first reason that applies", () => {
        const closedInOtherRun = buildIssueItem(1, { state: "closed" });

        const selection = select([closedInOtherRun], {
            itemsInActiveRuns: new Set([closedInOtherRun.id]),
        });

        expect(selection.excluded).toEqual([{ itemId: closedInOtherRun.id, reason: "closed" }]);
    });

    it("delivers the issues with the lowest numbers up to the limit", () => {
        const issues = [5, 3, 1, 4, 2].map((number) => buildIssueItem(number));

        const selection = select(issues, { config: { ...GITHUB_SOURCE, limit: 3 } });

        expect(selection.selected.map((item) => item.number)).toEqual([1, 2, 3]);
        expect(selection.excluded).toEqual([
            { itemId: "itm_issue4", reason: "limit" },
            { itemId: "itm_issue5", reason: "limit" },
        ]);
    });

    it("orders local items by creation", () => {
        const newer = buildLocalItem("itm_newer", "2026-05-04T10:00:00.000Z");
        const older = buildLocalItem("itm_older", "2026-05-04T09:00:00.000Z");

        const selection = select([newer, older], { config: LOCAL_SOURCE });

        expect(selection.selected).toEqual([older, newer]);
    });

    it("starts from the requested items, whatever their labels", () => {
        const requested = buildIssueItem(1, { labels: [] });
        const notRequested = buildIssueItem(2);

        const selection = select([requested, notRequested], { requestedIds: [requested.id] });

        expect(selection).toEqual({ selected: [requested], excluded: [] });
    });

    it("still excludes the blocked items among the requested ones", () => {
        const blocker = buildIssueItem(1);
        const blocked = buildIssueItem(2, { blockedBy: [blocker.id] });

        const selection = select([blocker, blocked], { requestedIds: [blocked.id] });

        expect(selection).toEqual({
            selected: [],
            excluded: [{ itemId: blocked.id, reason: "blocked" }],
        });
    });
});

describe("source executor", () => {
    let database: DatabaseHandle;
    let workItems: WorkItemService;
    let runs: InMemoryRunRepository;
    let github: FakeGitHubProvider;
    let executeSourceNode: NodeExecutor;

    beforeEach(() => {
        database = createTestDb();
        const clock = new FakeClock();
        const projectRepo = new ProjectRepository(database.db);
        projectRepo.insert(GITHUB_PROJECT);
        projectRepo.insert(LOCAL_PROJECT);
        workItems = createWorkItemService({
            repo: new WorkItemRepository(database.db),
            events: createEventBus(clock),
            clock,
        });
        runs = new InMemoryRunRepository();
        github = new FakeGitHubProvider();
        executeSourceNode = createSourceExecutor({
            workItems,
            runs,
            projects: createProjectService({
                repo: projectRepo,
                git: new FakeGitProvider(),
                fileExists: () => false,
                clock,
            }),
            clock,
            githubOf: () => Promise.resolve(github),
        });
    });

    afterEach(() => {
        database.close();
    });

    interface SourceRun {
        project: Project;
        config: SourceConfig;
        runItems?: WorkItemSnapshot[];
    }

    function runSource({ project, config, runItems = [] }: SourceRun) {
        const source = createNodeOfType("source", "source", SOURCE_POSITION);
        const node = { ...source, config };
        const run = buildRunRecord({ id: CURRENT_RUN_ID, projectId: project.id });

        return executeSourceNode(buildNodeExecutionContext(node, { project, run, runItems }));
    }

    function runGithubSource(overrides: Partial<SourceRun> = {}) {
        return runSource({ project: GITHUB_PROJECT, config: GITHUB_SOURCE, ...overrides });
    }

    function addLabeledIssue(number: number, blockedByNumbers: number[] = []): void {
        github.addIssue(
            REPO,
            buildGithubIssue({ number, labels: [SANDCASTLE_LABEL], blockedByNumbers }),
        );
    }

    async function importIssue(number: number): Promise<WorkItem> {
        addLabeledIssue(number);
        await workItems.upsertFromGithub(GITHUB_PROJECT.id, [
            buildGithubIssue({ number, labels: [SANDCASTLE_LABEL] }),
        ]);

        const items = await workItems.list(GITHUB_PROJECT.id);
        const item = items.find((candidate) => candidate.number === number);
        if (!item) {
            throw new Error(`Issue #${number} was not imported`);
        }

        return item;
    }

    async function startOtherActiveRun(overrides: Partial<RunRecord>): Promise<void> {
        await runs.createRun(
            buildRunRecord({
                id: OTHER_RUN_ID,
                projectId: GITHUB_PROJECT.id,
                status: "RUNNING",
                ...overrides,
            }),
        );
    }

    async function savePullRequestOfEarlierRun(item: WorkItem): Promise<void> {
        const nodeRunId = `git-${item.id}`;
        await runs.createRun(
            buildRunRecord({
                id: EARLIER_RUN_ID,
                projectId: GITHUB_PROJECT.id,
                status: "SUCCEEDED",
            }),
        );
        await runs.saveTransition({
            nodeRuns: [
                buildNodeRunState({ id: nodeRunId, runId: EARLIER_RUN_ID, workItemId: item.id }),
            ],
            artifacts: [
                buildArtifactRecord({
                    id: nodeRunId,
                    runId: EARLIER_RUN_ID,
                    nodeRunId,
                    kind: "pr_url",
                }),
            ],
        });
    }

    function addPullRequest(item: WorkItem, state: "open" | "merged"): void {
        github.addPullRequest(REPO, {
            number: 1,
            url: `https://github.com/${REPO}/pull/1`,
            state,
            headBranch: item.branch,
            baseBranch: "main",
        });
    }

    it("outputs the snapshots of the selected items and the source_selection artifact", async () => {
        const blocker = await workItems.createLocal(LOCAL_PROJECT.id, buildLocalItemInput());
        const blocked = await workItems.createLocal(
            LOCAL_PROJECT.id,
            buildLocalItemInput({ blockedBy: [blocker.id] }),
        );

        const result = await runSource({ project: LOCAL_PROJECT, config: LOCAL_SOURCE });

        expect(result).toEqual({
            outputs: { items: await workItems.snapshots(LOCAL_PROJECT.id, [blocker.id]) },
            artifacts: [
                {
                    name: "source_selection",
                    kind: "json",
                    value: {
                        selectedIds: [blocker.id],
                        excluded: [{ itemId: blocked.id, reason: "blocked" }],
                    },
                },
            ],
        });
    });

    it("excludes the items of another active run of the project", async () => {
        const inOtherRun = await importIssue(1);
        const free = await importIssue(2);
        await startOtherActiveRun({ itemIds: [inOtherRun.id] });

        const result = await runGithubSource();

        expect(selectionOf(result).selectedIds).toEqual([free.id]);
        expect(selectionOf(result).excluded).toEqual([
            { itemId: inOtherRun.id, reason: "in_other_run" },
        ]);
    });

    it("excludes the items another active run reached through its own source", async () => {
        const inOtherRun = await importIssue(1);
        const free = await importIssue(2);
        await startOtherActiveRun({});
        await runs.saveTransition({
            nodeRuns: [buildNodeRunState({ runId: OTHER_RUN_ID, workItemId: inOtherRun.id })],
        });

        const result = await runGithubSource();

        expect(selectionOf(result).selectedIds).toEqual([free.id]);
    });

    it("selects the items of runs that already finished", async () => {
        const issue = await importIssue(1);
        await startOtherActiveRun({ status: "SUCCEEDED", itemIds: [issue.id] });

        const result = await runGithubSource();

        expect(selectionOf(result).selectedIds).toEqual([issue.id]);
    });

    it("syncs the GitHub issues before selecting them", async () => {
        addLabeledIssue(1);

        const result = await runGithubSource();

        expect(result.outputs.items).toEqual([expect.objectContaining({ number: 1 })]);
    });

    it("releases a blocked issue on the next run once its blocker is closed", async () => {
        addLabeledIssue(1);
        addLabeledIssue(2, [1]);
        const firstResult = await runGithubSource();
        await github.closeIssue(REPO, 1);

        const nextResult = await runGithubSource();

        expect(firstResult.outputs.items).toEqual([expect.objectContaining({ number: 1 })]);
        expect(nextResult.outputs.items).toEqual([expect.objectContaining({ number: 2 })]);
    });

    it("fails when the GitHub issues cannot be synced", async () => {
        const syncWithoutRepository = runSource({ project: LOCAL_PROJECT, config: GITHUB_SOURCE });

        await expect(syncWithoutRepository).rejects.toThrow(GithubSyncFailedError);
    });

    it("excludes the items whose pull request from an earlier run is still open", async () => {
        const withOpenPr = await importIssue(1);
        const free = await importIssue(2);
        await savePullRequestOfEarlierRun(withOpenPr);
        addPullRequest(withOpenPr, "open");

        const result = await runGithubSource();

        expect(selectionOf(result).selectedIds).toEqual([free.id]);
        expect(selectionOf(result).excluded).toEqual([
            { itemId: withOpenPr.id, reason: "has_open_pr" },
        ]);
    });

    it("selects the items whose pull request was already merged", async () => {
        const withMergedPr = await importIssue(1);
        await savePullRequestOfEarlierRun(withMergedPr);
        addPullRequest(withMergedPr, "merged");

        const result = await runGithubSource();

        expect(selectionOf(result).selectedIds).toEqual([withMergedPr.id]);
    });

    it("delivers only the items the run started with", async () => {
        await importIssue(1);
        const requested = await importIssue(2);
        const runItems = await workItems.snapshots(GITHUB_PROJECT.id, [requested.id]);

        const result = await runGithubSource({ runItems });

        expect(result.outputs.items).toEqual(runItems);
    });
});

function selectionOf(result: NodeExecutionResult): SourceSelectionArtifact {
    return sourceSelectionArtifactSchema.parse(result.artifacts?.at(0)).value;
}

interface SelectionOverrides {
    config?: SourceConfig;
    requestedIds?: string[];
    itemsInActiveRuns?: Set<string>;
    itemsWithOpenPr?: Set<string>;
}

function select(candidates: WorkItem[], overrides: SelectionOverrides = {}) {
    return selectSourceItems({
        ...emptyContext(),
        candidates,
        all: itemsById(candidates),
        config: GITHUB_SOURCE,
        ...overrides,
    });
}

function emptyContext() {
    return { itemsInActiveRuns: new Set<string>(), itemsWithOpenPr: new Set<string>() };
}

function itemsById(items: WorkItem[]): Map<string, WorkItem> {
    return new Map(items.map((item) => [item.id, item]));
}

function buildIssueItem(number: number, overrides: Partial<WorkItem> = {}): WorkItem {
    return buildWorkItem({
        id: `itm_issue${number}`,
        number,
        title: `Issue ${number}`,
        url: `https://github.com/Fucks/forja/issues/${number}`,
        branch: `forja/issue-${number}`,
        labels: [SANDCASTLE_LABEL],
        ...overrides,
    });
}

function buildLocalItem(id: string, createdAt: string): WorkItem {
    return buildWorkItem({
        id,
        source: "local",
        number: undefined,
        url: undefined,
        createdAt,
    });
}
