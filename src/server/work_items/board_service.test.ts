import type { NodeRunState } from "@/engine/node_run_state.js";
import type { ArtifactRecord } from "@/server/runs/run_repository.js";
import { createBoardService } from "@/server/work_items/board_service.js";
import type { BoardService, BoardServiceDeps } from "@/server/work_items/board_service.js";
import { isBlockedByOpenItem } from "@/server/work_items/work_item_service.js";
import type { BoardCard } from "@/shared/board_types.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import type { FlowSummary, FlowVersion } from "@/shared/flow_types.js";
import type { UsageAggregate } from "@/shared/usage_types.js";
import type { WorkItem } from "@/shared/work_item_types.js";
import { buildCanonicalFlow, buildLoopFlowWithExits } from "@/test/factories/flow_graph_factory.js";
import { buildNodeRunState } from "@/test/factories/node_run_state_factory.js";
import { buildArtifactRecord, buildRunRecord } from "@/test/factories/run_record_factory.js";
import { buildWorkItem } from "@/test/factories/work_item_factory.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { InMemoryRunRepository } from "@/test/fakes/in_memory_run_repository.js";

const PROJECT_ID = "prj_forja";
const FLOW_ID = "flw_sandcastle";
const RUN_ID = "run_1";
const NOW = new Date("2026-11-10T12:00:00.000Z");
const EIGHT_DAYS_AGO = "2026-11-02T12:00:00.000Z";
const SIX_DAYS_AGO = "2026-11-04T12:00:00.000Z";
const PR_URL = "https://github.com/Fucks/forja/pull/12";

function buildFlowSummary(overrides: Partial<FlowSummary> = {}): FlowSummary {
    return {
        id: FLOW_ID,
        projectId: PROJECT_ID,
        name: "Sandcastle",
        isDefault: true,
        archived: false,
        latestVersion: 2,
        draftUpdatedAt: NOW.toISOString(),
        draftRevision: 1,
        ...overrides,
    };
}

function buildUsageAggregate(workItemId: string, costUsd: number): UsageAggregate {
    return {
        key: workItemId,
        label: workItemId,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        costUsd,
        nodeRuns: 1,
    };
}

interface BoardFixture {
    items?: WorkItem[];
    flows?: FlowSummary[];
    graph?: FlowGraph;
    costs?: UsageAggregate[];
}

describe("board service", () => {
    let runs: InMemoryRunRepository;

    beforeEach(() => {
        runs = new InMemoryRunRepository();
    });

    function createBoard(fixture: BoardFixture = {}): BoardService {
        const graph = fixture.graph ?? buildCanonicalFlow();
        const deps: BoardServiceDeps = {
            workItems: {
                list: () => Promise.resolve(fixture.items ?? []),
                isBlocked: isBlockedByOpenItem,
            },
            flows: {
                list: () => Promise.resolve(fixture.flows ?? [buildFlowSummary()]),
                getVersion: (flowId, version): Promise<FlowVersion> =>
                    Promise.resolve({ flowId, version, graph, publishedAt: NOW.toISOString() }),
            },
            runs,
            usage: { aggregate: () => Promise.resolve(fixture.costs ?? []) },
            clock: new FakeClock(NOW),
        };

        return createBoardService(deps);
    }

    async function saveRunOf(
        item: WorkItem,
        nodeRuns: Partial<NodeRunState>[],
        artifacts: Partial<ArtifactRecord>[] = [],
    ): Promise<void> {
        await runs.createRun(buildRunRecord({ id: RUN_ID, projectId: PROJECT_ID }));
        await runs.saveTransition({
            nodeRuns: nodeRuns.map((nodeRun) =>
                buildNodeRunState({ runId: RUN_ID, workItemId: item.id, ...nodeRun }),
            ),
            artifacts: artifacts.map((artifact) =>
                buildArtifactRecord({ runId: RUN_ID, ...artifact }),
            ),
        });
    }

    async function cardOf(board: BoardService, item: WorkItem): Promise<BoardCard | undefined> {
        const view = await board.getBoard(PROJECT_ID);
        return view.cards.find((card) => card.item.id === item.id);
    }

    it("shows the columns of the published default flow", async () => {
        const view = await createBoard().getBoard(PROJECT_ID);

        expect(view.flowId).toBe(FLOW_ID);
        expect(view.columns.map((column) => column.id)).toEqual([
            "backlog",
            "blocked",
            "stage:specify",
            "stage:develop",
            "stage:review_and_open_pr",
            "needs_human",
            "done",
        ]);
    });

    it("shows only the fixed columns when the default flow was never published", async () => {
        const board = createBoard({ flows: [buildFlowSummary({ latestVersion: undefined })] });

        const view = await board.getBoard(PROJECT_ID);

        expect(view.flowId).toBeUndefined();
        expect(view.columns.map((column) => column.id)).toEqual([
            "backlog",
            "blocked",
            "needs_human",
            "done",
        ]);
    });

    it("shows only the fixed columns when no flow is the default", async () => {
        const board = createBoard({ flows: [buildFlowSummary({ isDefault: false })] });

        const view = await board.getBoard(PROJECT_ID);

        expect(view.flowId).toBeUndefined();
    });

    it("puts an item with the Dev running in Desenvolver, with the node and the run", async () => {
        const item = buildWorkItem({ id: "itm_dev" });
        await saveRunOf(item, [
            { id: "nr_tl", nodeId: "tl", status: "SUCCEEDED" },
            { id: "nr_dev", nodeId: "dev", status: "RUNNING" },
        ]);

        const card = await cardOf(createBoard({ items: [item] }), item);

        expect(card).toEqual({
            item,
            columnId: "stage:develop",
            status: "RUNNING",
            currentNodeLabel: "Dev",
            runId: RUN_ID,
        });
    });

    it("adds the accumulated cost of the item", async () => {
        const item = buildWorkItem({ id: "itm_cost" });
        const costs = [buildUsageAggregate(item.id, 1.25)];

        const card = await cardOf(createBoard({ items: [item], costs }), item);

        expect(card?.costUsd).toBe(1.25);
    });

    it("adds the pull request opened by the last run", async () => {
        const item = buildWorkItem({ id: "itm_pr" });
        await saveRunOf(
            item,
            [{ id: "nr_open_pr", nodeId: "open_pr", status: "SUCCEEDED" }],
            [
                {
                    id: "art_pr",
                    nodeRunId: "nr_open_pr",
                    name: "pr_url",
                    kind: "pr_url",
                    value: PR_URL,
                },
            ],
        );

        const card = await cardOf(createBoard({ items: [item] }), item);

        expect(card?.prUrl).toBe(PR_URL);
    });

    it("puts an item that left the loop through exhausted in Precisa de humano", async () => {
        const item = buildWorkItem({ id: "itm_exhausted" });
        await saveRunOf(
            item,
            [
                { id: "nr_review", nodeId: "review", status: "SUCCEEDED" },
                { id: "nr_needs_human", nodeId: "needs_human", status: "SUCCEEDED" },
            ],
            [
                {
                    id: "art_outcome",
                    nodeRunId: "nr_needs_human",
                    name: "item_outcome",
                    kind: "json",
                    value: { moveItemTo: "needs_human" },
                },
            ],
        );

        const board = createBoard({ items: [item], graph: buildLoopFlowWithExits() });

        expect((await cardOf(board, item))?.columnId).toBe("needs_human");
    });

    it("puts an item blocked by an open item in Bloqueado", async () => {
        const blocker = buildWorkItem({ id: "itm_blocker" });
        const blocked = buildWorkItem({ id: "itm_blocked", blockedBy: [blocker.id] });

        const card = await cardOf(createBoard({ items: [blocker, blocked] }), blocked);

        expect(card?.columnId).toBe("blocked");
    });

    it("shows the items closed in the last 7 days in Concluído and hides older ones", async () => {
        const recentlyClosed = buildWorkItem({
            id: "itm_recent",
            state: "closed",
            updatedAt: SIX_DAYS_AGO,
        });
        const closedLongAgo = buildWorkItem({
            id: "itm_old",
            state: "closed",
            updatedAt: EIGHT_DAYS_AGO,
        });

        const view = await createBoard({ items: [recentlyClosed, closedLongAgo] }).getBoard(
            PROJECT_ID,
        );

        expect(view.cards.map((card) => [card.item.id, card.columnId])).toEqual([
            ["itm_recent", "done"],
        ]);
    });
});
