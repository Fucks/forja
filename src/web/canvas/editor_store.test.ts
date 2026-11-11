import type { FlowGraph } from "@/shared/flow_graph.js";
import type { FlowDraft } from "@/shared/flow_types.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { createEditorStore, HISTORY_MERGE_WINDOW_MS } from "@/web/canvas/editor_store.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";

function buildDraft(overrides: Partial<FlowDraft> = {}): FlowDraft {
    return {
        flowId: "flw_canonico",
        graph: buildCanonicalFlow(),
        revision: 3,
        updatedAt: "2026-11-09T12:00:00Z",
        ...overrides,
    };
}

function renameFirstNode(graph: FlowGraph): FlowGraph {
    return {
        ...graph,
        nodes: graph.nodes.map((node, index) => (index === 0 ? { ...node, label: "Novo" } : node)),
    };
}

function moveFirstNodeTo(x: number): (graph: FlowGraph) => FlowGraph {
    return (graph) => ({
        ...graph,
        nodes: graph.nodes.map((node, index) =>
            index === 0 ? { ...node, position: { ...node.position, x } } : node,
        ),
    });
}

function removeLastNode(graph: FlowGraph): FlowGraph {
    return { ...graph, nodes: graph.nodes.slice(0, -1) };
}

function createLoadedStore(clock: FakeClock = new FakeClock()): EditorStore {
    const store = createEditorStore(clock);
    store.getState().load(buildDraft());

    return store;
}

describe("createEditorStore", () => {
    describe("load", () => {
        it("takes the flow, graph and revision from the draft", () => {
            const store = createEditorStore();

            store.getState().load(buildDraft());

            expect(store.getState()).toMatchObject({
                flowId: "flw_canonico",
                graph: buildCanonicalFlow(),
                revision: 3,
                dirty: false,
                saveState: "idle",
            });
        });

        it("discards the unsaved changes, the selection and the conflict", () => {
            const store = createLoadedStore();
            store.getState().applyGraph(renameFirstNode);
            store.getState().select(["dev"]);
            store.getState().markConflict();

            store.getState().load(buildDraft({ revision: 4 }));

            expect(store.getState()).toMatchObject({
                graph: buildCanonicalFlow(),
                revision: 4,
                dirty: false,
                selection: [],
                saveState: "idle",
            });
        });
    });

    describe("applyGraph", () => {
        it("replaces the graph with the updated one and marks it dirty", () => {
            const store = createLoadedStore();

            store.getState().applyGraph(renameFirstNode);

            expect(store.getState().graph.nodes[0]?.label).toBe("Novo");
            expect(store.getState().dirty).toBe(true);
        });

        it("leaves the previous graph untouched", () => {
            const store = createLoadedStore();
            const previousGraph = store.getState().graph;

            store.getState().applyGraph(renameFirstNode);

            expect(store.getState().graph).not.toBe(previousGraph);
            expect(previousGraph).toEqual(buildCanonicalFlow());
        });
    });

    describe("undo and redo", () => {
        const STEP_PAUSE_MS = HISTORY_MERGE_WINDOW_MS + 1;

        function applyAsSeparateSteps(
            clock: FakeClock,
            store: EditorStore,
            updates: ((graph: FlowGraph) => FlowGraph)[],
        ): FlowGraph[] {
            return updates.map((update) => {
                clock.advance(STEP_PAUSE_MS);
                store.getState().applyGraph(update);
                return store.getState().graph;
            });
        }

        it("has nothing to undo right after loading", () => {
            const store = createLoadedStore();

            expect(store.getState().canUndo).toBe(false);
            expect(store.getState().canRedo).toBe(false);
        });

        it("undoes renaming, moving and removing nodes in the reverse order", () => {
            const clock = new FakeClock();
            const store = createLoadedStore(clock);
            const [renamed, moved] = applyAsSeparateSteps(clock, store, [
                renameFirstNode,
                moveFirstNodeTo(999),
                removeLastNode,
            ]);

            const undoneGraphs = [1, 2, 3].map(() => {
                store.getState().undo();
                return store.getState().graph;
            });

            expect(undoneGraphs).toEqual([moved, renamed, buildCanonicalFlow()]);
            expect(store.getState().canUndo).toBe(false);
        });

        it("redoes the undone changes in their original order", () => {
            const clock = new FakeClock();
            const store = createLoadedStore(clock);
            const changedGraphs = applyAsSeparateSteps(clock, store, [
                renameFirstNode,
                moveFirstNodeTo(999),
                removeLastNode,
            ]);
            [1, 2, 3].forEach(() => store.getState().undo());

            const redoneGraphs = [1, 2, 3].map(() => {
                store.getState().redo();
                return store.getState().graph;
            });

            expect(redoneGraphs).toEqual(changedGraphs);
            expect(store.getState().canRedo).toBe(false);
        });

        it("merges the changes made within the merge window into one step", () => {
            const clock = new FakeClock();
            const store = createLoadedStore(clock);
            store.getState().applyGraph(moveFirstNodeTo(100));
            clock.advance(HISTORY_MERGE_WINDOW_MS - 1);
            store.getState().applyGraph(moveFirstNodeTo(200));
            clock.advance(HISTORY_MERGE_WINDOW_MS - 1);
            store.getState().applyGraph(moveFirstNodeTo(300));

            store.getState().undo();

            expect(store.getState().graph).toEqual(buildCanonicalFlow());
            expect(store.getState().canUndo).toBe(false);
        });

        it("starts a new step after undoing, even within the merge window", () => {
            const store = createLoadedStore();
            store.getState().applyGraph(renameFirstNode);
            store.getState().undo();

            store.getState().applyGraph(removeLastNode);
            store.getState().undo();

            expect(store.getState().graph).toEqual(buildCanonicalFlow());
            expect(store.getState().canRedo).toBe(true);
        });

        it("records no step when the update leaves the graph unchanged", () => {
            const store = createLoadedStore();

            store.getState().applyGraph((graph) => graph);

            expect(store.getState().canUndo).toBe(false);
            expect(store.getState().dirty).toBe(false);
        });

        it("marks the draft dirty so the undone graph is saved", () => {
            const store = createLoadedStore();
            store.getState().applyGraph(renameFirstNode);
            store.getState().markSaved(4);

            store.getState().undo();

            expect(store.getState().dirty).toBe(true);
        });

        it("forgets the previous draft's history when a draft is loaded", () => {
            const store = createLoadedStore();
            store.getState().applyGraph(renameFirstNode);

            store.getState().load(buildDraft({ revision: 4 }));

            expect(store.getState().canUndo).toBe(false);
        });
    });

    describe("select", () => {
        it("keeps the selected ids", () => {
            const store = createLoadedStore();

            store.getState().select(["dev", "develop"]);

            expect(store.getState().selection).toEqual(["dev", "develop"]);
        });

        it("does not mark the graph dirty", () => {
            const store = createLoadedStore();

            store.getState().select(["dev"]);

            expect(store.getState().dirty).toBe(false);
        });
    });

    describe("save states", () => {
        it("marks the draft as saving", () => {
            const store = createLoadedStore();

            store.getState().markSaving();

            expect(store.getState().saveState).toBe("saving");
        });

        it("takes the saved revision and clears dirty when the save succeeds", () => {
            const store = createLoadedStore();
            store.getState().applyGraph(renameFirstNode);

            store.getState().markSaved(4);

            expect(store.getState()).toMatchObject({
                revision: 4,
                dirty: false,
                saveState: "saved",
            });
        });

        it("marks a conflict without touching the graph", () => {
            const store = createLoadedStore();
            store.getState().applyGraph(renameFirstNode);

            store.getState().markConflict();

            expect(store.getState()).toMatchObject({ saveState: "conflict", dirty: true });
        });

        it("marks a failed save", () => {
            const store = createLoadedStore();

            store.getState().markSaveFailed();

            expect(store.getState().saveState).toBe("error");
        });
    });
});
