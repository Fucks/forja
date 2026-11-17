import { deriveColumns, placeItem } from "@/engine/board_columns.js";
import type {
    BoardColumnDef,
    ItemPlacement,
    ItemPlacementContext,
} from "@/engine/board_columns.js";
import type { NodeRunState } from "@/engine/node_run_state.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import type { WorkItem } from "@/shared/work_item_types.js";
import {
    buildCanonicalFlow,
    buildLoopFlow,
    connect,
    createNodeOfType,
} from "@/test/factories/flow_graph_factory.js";
import { buildNodeRunState } from "@/test/factories/node_run_state_factory.js";
import { buildWorkItem } from "@/test/factories/work_item_factory.js";
import {
    addEdges,
    addGroups,
    addNodes,
    buildMapGroup,
} from "@/test/factories/flow_graph_variations.js";

const ORIGIN = { x: 0, y: 0 };

function columnLabels(columns: BoardColumnDef[]): string[] {
    return columns.map((column) => column.label);
}

function withFinalStepsOutsideMaps(graph: FlowGraph): FlowGraph {
    const finalReview = {
        ...createNodeOfType("agent", "final_review", ORIGIN),
        label: "Revisão final",
    };
    const approval = { ...createNodeOfType("gate", "approval", ORIGIN), label: "Aprovação" };
    const notify = { ...createNodeOfType("script", "notify", ORIGIN), label: "Notificar" };

    return addEdges(addNodes(graph, [notify, approval, finalReview]), [
        connect(["open_pr", "result"], ["final_review", "context"]),
        connect(["final_review", "summary"], ["approval", "input"]),
        connect(["approval", "approved"], ["notify", "input"]),
    ]);
}

describe("deriveColumns", () => {
    it("turns each top-level map of the canonical flow into a stage between the fixed columns", () => {
        const columns = deriveColumns(buildCanonicalFlow());

        expect(columnLabels(columns)).toEqual([
            "Backlog",
            "Bloqueado",
            "Especificar",
            "Desenvolver",
            "Revisar e abrir PR",
            "Precisa de humano",
            "Concluído",
        ]);
    });

    it("identifies each stage by its map", () => {
        const columns = deriveColumns(buildCanonicalFlow());

        expect(columns.find((column) => column.label === "Desenvolver")).toEqual({
            id: "stage:develop",
            label: "Desenvolver",
            kind: "stage",
            groupOrNodeId: "develop",
        });
    });

    it("turns agent and gate nodes outside maps into stages, but not other node types", () => {
        const columns = deriveColumns(withFinalStepsOutsideMaps(buildCanonicalFlow()));

        expect(columnLabels(columns)).toEqual([
            "Backlog",
            "Bloqueado",
            "Especificar",
            "Desenvolver",
            "Revisar e abrir PR",
            "Revisão final",
            "Aprovação",
            "Precisa de humano",
            "Concluído",
        ]);
    });

    it("keeps a map nested in another map inside the stage of the outer map", () => {
        const graph = addGroups(buildLoopFlow(), [
            buildMapGroup("inner_map", { parentGroupId: "items" }),
        ]);
        const nestedGraph = {
            ...graph,
            nodes: graph.nodes.map((node) =>
                node.id === "tests" ? { ...node, parentGroupId: "inner_map" } : node,
            ),
        };

        const stages = deriveColumns(nestedGraph).filter((column) => column.kind === "stage");

        expect(columnLabels(stages)).toEqual(["Por item"]);
    });

    it("has only the fixed columns when the flow has no stage", () => {
        const graph: FlowGraph = { schemaVersion: 2, nodes: [], edges: [], groups: [] };

        expect(columnLabels(deriveColumns(graph))).toEqual([
            "Backlog",
            "Bloqueado",
            "Precisa de humano",
            "Concluído",
        ]);
    });
});

describe("placeItem", () => {
    const graph = buildCanonicalFlow();
    const columns = deriveColumns(graph);

    function place(item: WorkItem, context: Partial<ItemPlacementContext> = {}): ItemPlacement {
        return placeItem(item, {
            columns,
            graph,
            latestNodeRuns: [],
            isBlocked: false,
            ...context,
        });
    }

    function nodeRunOf(nodeId: string, status: NodeRunState["status"]): NodeRunState {
        return buildNodeRunState({ id: `nr_${nodeId}`, nodeId, status });
    }

    it("puts an open item without runs in the backlog", () => {
        expect(place(buildWorkItem())).toEqual({ columnId: "backlog" });
    });

    it("puts a blocked item without an active node run in Bloqueado", () => {
        expect(place(buildWorkItem(), { isBlocked: true })).toEqual({ columnId: "blocked" });
    });

    it("puts the item in the stage of its running node, with the node and its status", () => {
        const latestNodeRuns = [nodeRunOf("tl", "SUCCEEDED"), nodeRunOf("dev", "RUNNING")];

        expect(place(buildWorkItem(), { latestNodeRuns, isBlocked: true })).toEqual({
            columnId: "stage:develop",
            status: "RUNNING",
            currentNodeId: "dev",
        });
    });

    it("follows the earliest unfinished node of the flow when several are unfinished", () => {
        const latestNodeRuns = [nodeRunOf("open_pr", "PENDING"), nodeRunOf("reviewer", "QUEUED")];

        expect(place(buildWorkItem(), { latestNodeRuns })).toMatchObject({
            columnId: "stage:review_and_open_pr",
            currentNodeId: "reviewer",
        });
    });

    it("ignores the node runs that already finished", () => {
        const latestNodeRuns = [nodeRunOf("tl", "SUCCEEDED"), nodeRunOf("dev", "FAILED")];

        expect(place(buildWorkItem(), { latestNodeRuns })).toEqual({ columnId: "backlog" });
    });

    it("puts a closed item in Concluído even while a node run is unfinished", () => {
        const latestNodeRuns = [nodeRunOf("dev", "RUNNING")];

        expect(place(buildWorkItem({ state: "closed" }), { latestNodeRuns })).toEqual({
            columnId: "done",
        });
    });

    it("puts the item where the outcome of its last run sent it", () => {
        expect(place(buildWorkItem(), { outcome: "needs_human" })).toEqual({
            columnId: "needs_human",
        });
        expect(place(buildWorkItem(), { outcome: "done" })).toEqual({ columnId: "done" });
    });

    it("puts the item in its manual column before any other rule", () => {
        const item = buildWorkItem({ state: "closed", manualColumn: "backlog" });

        expect(place(item, { outcome: "done" })).toEqual({ columnId: "backlog" });
    });
});
