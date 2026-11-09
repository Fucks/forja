import { create } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";

import type { FlowGraph } from "@/shared/flow_graph.js";
import type { FlowDraft } from "@/shared/flow_types.js";

export type SaveState = "idle" | "saving" | "saved" | "conflict" | "error";

export interface EditorState {
    flowId: string;
    graph: FlowGraph;
    revision: number;
    dirty: boolean;
    selection: string[];
    saveState: SaveState;
    load(draft: FlowDraft): void;
    /** Every graph change goes through here, so undo (#38) can record it. */
    applyGraph(update: (graph: FlowGraph) => FlowGraph): void;
    select(ids: string[]): void;
    markSaving(): void;
    markSaved(revision: number): void;
    markConflict(): void;
    markSaveFailed(): void;
}

export type EditorStore = UseBoundStore<StoreApi<EditorState>>;

const EMPTY_GRAPH: FlowGraph = { schemaVersion: 1, nodes: [], edges: [], groups: [] };
const NO_REVISION = 0;

export function createEditorStore(): EditorStore {
    return create<EditorState>()((set) => ({
        flowId: "",
        graph: EMPTY_GRAPH,
        revision: NO_REVISION,
        dirty: false,
        selection: [],
        saveState: "idle",
        load: (draft) =>
            set({
                flowId: draft.flowId,
                graph: draft.graph,
                revision: draft.revision,
                dirty: false,
                selection: [],
                saveState: "idle",
            }),
        applyGraph: (update) => set((state) => ({ graph: update(state.graph), dirty: true })),
        select: (ids) => set({ selection: ids }),
        markSaving: () => set({ saveState: "saving" }),
        markSaved: (revision) => set({ revision, dirty: false, saveState: "saved" }),
        markConflict: () => set({ saveState: "conflict" }),
        markSaveFailed: () => set({ saveState: "error" }),
    }));
}
