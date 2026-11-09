import type { FlowGraph } from "@/shared/flow_graph.js";
import type { FlowDraft } from "@/shared/flow_types.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { createEditorStore } from "@/web/canvas/editor_store.js";

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

function createLoadedStore(): ReturnType<typeof createEditorStore> {
    const store = createEditorStore();
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
