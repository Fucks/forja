import type { FlowGraph, Position } from "@/shared/flow_graph.js";
import { buildCanonicalFlow, buildLoopFlow } from "@/test/factories/flow_graph_factory.js";
import {
    containsTrigger,
    copySelection,
    parseFlowFragment,
    pasteFragment,
} from "@/web/canvas/clipboard.js";
import type { FlowFragment } from "@/web/canvas/clipboard.js";

const CANONICAL_FLOW = buildCanonicalFlow();
const LOOP_FLOW = buildLoopFlow();
const EMPTY_FLOW: FlowGraph = { schemaVersion: 1, nodes: [], edges: [], groups: [] };
const PASTE_POINT: Position = { x: 2000, y: 1000 };

function createIdSequence(): () => string {
    let nextNumber = 1;

    return () => `copy_${nextNumber++}`;
}

function listIds(elements: { id: string }[]): string[] {
    return elements.map((element) => element.id);
}

function pasteIntoEmptyFlow(fragment: FlowFragment): FlowGraph {
    return pasteFragment(EMPTY_FLOW, fragment, PASTE_POINT, createIdSequence()).graph;
}

function topLeftCorner(graph: FlowGraph): Position {
    const positions = [...graph.nodes, ...graph.groups].map((element) => element.position);

    return {
        x: Math.min(...positions.map((position) => position.x)),
        y: Math.min(...positions.map((position) => position.y)),
    };
}

describe("copySelection", () => {
    it("copies a map with its nodes and the edges between them", () => {
        const fragment = copySelection(CANONICAL_FLOW, ["review_and_open_pr"]);

        expect(listIds(fragment.groups)).toEqual(["review_and_open_pr"]);
        expect(listIds(fragment.nodes)).toEqual(["reviewer", "open_pr", "output"]);
        expect(listIds(fragment.edges)).toEqual(["reviewer.summary->open_pr.body"]);
    });

    it("copies the groups nested inside a selected group", () => {
        const fragment = copySelection(LOOP_FLOW, ["items"]);

        expect(listIds(fragment.groups)).toEqual(["items", "review_loop"]);
        expect(listIds(fragment.nodes)).toEqual(["dev", "tests", "review"]);
        expect(fragment.edges).toHaveLength(3);
    });

    it("leaves out the edges that reach nodes outside the selection", () => {
        const fragment = copySelection(CANONICAL_FLOW, ["dev"]);

        expect(listIds(fragment.nodes)).toEqual(["dev"]);
        expect(fragment.edges).toEqual([]);
    });
});

describe("pasteFragment", () => {
    it("gives every pasted node, group and edge a new id", () => {
        const fragment = copySelection(CANONICAL_FLOW, ["review_and_open_pr"]);

        const { graph } = pasteFragment(CANONICAL_FLOW, fragment, PASTE_POINT, createIdSequence());

        const allIds = listIds([...graph.nodes, ...graph.groups, ...graph.edges]);
        expect(new Set(allIds).size).toBe(allIds.length);
        expect(graph.nodes).toHaveLength(CANONICAL_FLOW.nodes.length + 3);
    });

    it("keeps the copied edges between the pasted copies", () => {
        const fragment = copySelection(CANONICAL_FLOW, ["review_and_open_pr"]);

        const pasted = pasteIntoEmptyFlow(fragment);

        const reviewerCopy = pasted.nodes.find((node) => node.label === "Reviewer");
        const pullRequestCopy = pasted.nodes.find((node) => node.type === "git");
        expect(pasted.edges.map(({ from, to }) => ({ from, to }))).toEqual([
            {
                from: { nodeId: reviewerCopy?.id, port: "summary" },
                to: { nodeId: pullRequestCopy?.id, port: "body" },
            },
        ]);
    });

    it("keeps the pasted nodes and groups inside their pasted parents", () => {
        const fragment = copySelection(LOOP_FLOW, ["items"]);

        const pasted = pasteIntoEmptyFlow(fragment);

        const [outerMap, innerLoop] = pasted.groups;
        expect(innerLoop?.parentGroupId).toBe(outerMap?.id);
        expect(pasted.nodes.every((node) => node.parentGroupId === innerLoop?.id)).toBe(true);
    });

    it("pastes at the top level the elements whose group was not copied", () => {
        const fragment = copySelection(CANONICAL_FLOW, ["dev"]);

        const pasted = pasteIntoEmptyFlow(fragment);

        expect(pasted.nodes[0]?.parentGroupId).toBeUndefined();
    });

    it("moves the fragment so its top-left corner lands on the paste point", () => {
        const fragment = copySelection(CANONICAL_FLOW, ["review_and_open_pr"]);

        const pasted = pasteIntoEmptyFlow(fragment);

        expect(topLeftCorner(pasted)).toEqual(PASTE_POINT);
    });

    it("ignores the trigger and its edges", () => {
        const fragment = copySelection(CANONICAL_FLOW, ["trigger", "source"]);

        const pasted = pasteIntoEmptyFlow(fragment);

        expect(containsTrigger(fragment)).toBe(true);
        expect(pasted.nodes.map((node) => node.type)).toEqual(["source"]);
        expect(pasted.edges).toEqual([]);
    });

    it("returns the ids of the pasted nodes and groups", () => {
        const fragment = copySelection(CANONICAL_FLOW, ["review_and_open_pr"]);

        const { graph, pastedIds } = pasteFragment(
            EMPTY_FLOW,
            fragment,
            PASTE_POINT,
            createIdSequence(),
        );

        expect(pastedIds).toEqual(listIds([...graph.groups, ...graph.nodes]));
    });

    it("leaves the graph untouched when there is nothing to paste", () => {
        const fragment = copySelection(CANONICAL_FLOW, ["trigger"]);

        const { graph, pastedIds } = pasteFragment(
            CANONICAL_FLOW,
            fragment,
            PASTE_POINT,
            createIdSequence(),
        );

        expect(graph).toBe(CANONICAL_FLOW);
        expect(pastedIds).toEqual([]);
    });
});

describe("parseFlowFragment", () => {
    it("reads back a copied fragment from its JSON text", () => {
        const fragment = copySelection(CANONICAL_FLOW, ["review_and_open_pr"]);

        expect(parseFlowFragment(JSON.stringify(fragment))).toEqual(fragment);
    });

    it.each(["", "texto qualquer", '{"nodes": "não"}'])(
        "returns nothing for text that is not a fragment: %j",
        (text) => {
            expect(parseFlowFragment(text)).toBeUndefined();
        },
    );
});
