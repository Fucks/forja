import type { FlowGraph } from "@/shared/flow_graph.js";
import { createHistory } from "@/web/canvas/history.js";

// Each graph is a distinct object, so the assertions tell them apart by identity.
function buildGraph(): FlowGraph {
    return { schemaVersion: 1, nodes: [], edges: [], groups: [] };
}

const FIRST = buildGraph();
const SECOND = buildGraph();
const THIRD = buildGraph();

describe("createHistory", () => {
    it("has nothing to undo or redo when empty", () => {
        const history = createHistory(10);

        expect(history.canUndo).toBe(false);
        expect(history.canRedo).toBe(false);
        expect(history.undo(FIRST)).toBeUndefined();
        expect(history.redo(FIRST)).toBeUndefined();
    });

    it("undoes back to the recorded graphs, the most recent first", () => {
        const history = createHistory(10);
        history.push(FIRST);
        history.push(SECOND);

        const undoneOnce = history.undo(THIRD);
        const undoneTwice = history.undo(SECOND);

        expect(undoneOnce).toBe(SECOND);
        expect(undoneTwice).toBe(FIRST);
        expect(history.canUndo).toBe(false);
    });

    it("redoes the undone graphs in the order they were undone", () => {
        const history = createHistory(10);
        history.push(FIRST);
        history.push(SECOND);
        history.undo(THIRD);
        history.undo(SECOND);

        const redoneOnce = history.redo(FIRST);
        const redoneTwice = history.redo(SECOND);

        expect(redoneOnce).toBe(SECOND);
        expect(redoneTwice).toBe(THIRD);
        expect(history.canRedo).toBe(false);
    });

    it("forgets the undone graphs when a new change is recorded", () => {
        const history = createHistory(10);
        history.push(FIRST);
        history.undo(SECOND);

        history.push(FIRST);

        expect(history.canRedo).toBe(false);
        expect(history.redo(THIRD)).toBeUndefined();
    });

    it("keeps only the most recent graphs up to the limit", () => {
        const history = createHistory(2);
        history.push(FIRST);
        history.push(SECOND);
        history.push(THIRD);

        const undoneOnce = history.undo(buildGraph());
        const undoneTwice = history.undo(THIRD);

        expect(undoneOnce).toBe(THIRD);
        expect(undoneTwice).toBe(SECOND);
        expect(history.canUndo).toBe(false);
    });
});
