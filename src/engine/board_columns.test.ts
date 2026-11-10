import { deriveColumns } from "@/engine/board_columns.js";
import type { BoardColumnDef } from "@/engine/board_columns.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import {
    buildCanonicalFlow,
    buildLoopFlow,
    connect,
    createNodeOfType,
} from "@/test/factories/flow_graph_factory.js";
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
        const graph: FlowGraph = { schemaVersion: 1, nodes: [], edges: [], groups: [] };

        expect(columnLabels(deriveColumns(graph))).toEqual([
            "Backlog",
            "Bloqueado",
            "Precisa de humano",
            "Concluído",
        ]);
    });
});
