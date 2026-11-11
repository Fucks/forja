import { create } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";

import { systemClock } from "@/lib/clock.js";
import type { Clock } from "@/lib/clock.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import type { FlowDraft } from "@/shared/flow_types.js";
import { createHistory } from "@/web/canvas/history.js";
import type { GraphHistory } from "@/web/canvas/history.js";

export type SaveState = "idle" | "saving" | "saved" | "conflict" | "error";

export interface EditorState {
    flowId: string;
    graph: FlowGraph;
    revision: number;
    dirty: boolean;
    selection: string[];
    saveState: SaveState;
    canUndo: boolean;
    canRedo: boolean;
    load(draft: FlowDraft): void;
    /** Every graph change goes through here, so undo can record it. */
    applyGraph(update: (graph: FlowGraph) => FlowGraph): void;
    undo(): void;
    redo(): void;
    select(ids: string[]): void;
    markSaving(): void;
    markSaved(revision: number): void;
    markConflict(): void;
    markSaveFailed(): void;
}

export type EditorStore = UseBoundStore<StoreApi<EditorState>>;

const EMPTY_GRAPH: FlowGraph = { schemaVersion: 1, nodes: [], edges: [], groups: [] };
const NO_REVISION = 0;

export const HISTORY_LIMIT = 100;
// A drag reports a move on every frame; the changes that follow each other this closely are one step.
export const HISTORY_MERGE_WINDOW_MS = 500;

export function createEditorStore(clock: Pick<Clock, "now"> = systemClock): EditorStore {
    let history = createHistory(HISTORY_LIMIT);
    let lastChangeAtMs = Number.NEGATIVE_INFINITY;

    function recordStep(previousGraph: FlowGraph): void {
        const nowMs = clock.now().getTime();
        if (nowMs - lastChangeAtMs > HISTORY_MERGE_WINDOW_MS) {
            history.push(previousGraph);
        }
        lastChangeAtMs = nowMs;
    }

    function startNewStep(): void {
        lastChangeAtMs = Number.NEGATIVE_INFINITY;
    }

    function restoreFromHistory(
        state: EditorState,
        move: (current: FlowGraph) => FlowGraph | undefined,
    ): Partial<EditorState> {
        const graph = move(state.graph);
        if (!graph) {
            return {};
        }

        startNewStep();
        return { graph, dirty: true, ...describeHistory(history) };
    }

    return create<EditorState>()((set) => ({
        flowId: "",
        graph: EMPTY_GRAPH,
        revision: NO_REVISION,
        dirty: false,
        selection: [],
        saveState: "idle",
        canUndo: false,
        canRedo: false,
        load: (draft) => {
            history = createHistory(HISTORY_LIMIT);
            startNewStep();
            set({
                flowId: draft.flowId,
                graph: draft.graph,
                revision: draft.revision,
                dirty: false,
                selection: [],
                saveState: "idle",
                ...describeHistory(history),
            });
        },
        applyGraph: (update) =>
            set((state) => {
                const graph = update(state.graph);
                if (graph === state.graph) {
                    return {};
                }

                recordStep(state.graph);
                return { graph, dirty: true, ...describeHistory(history) };
            }),
        undo: () => set((state) => restoreFromHistory(state, (current) => history.undo(current))),
        redo: () => set((state) => restoreFromHistory(state, (current) => history.redo(current))),
        select: (ids) => set({ selection: ids }),
        markSaving: () => set({ saveState: "saving" }),
        markSaved: (revision) => set({ revision, dirty: false, saveState: "saved" }),
        markConflict: () => set({ saveState: "conflict" }),
        markSaveFailed: () => set({ saveState: "error" }),
    }));
}

function describeHistory(history: GraphHistory): Pick<EditorState, "canUndo" | "canRedo"> {
    return { canUndo: history.canUndo, canRedo: history.canRedo };
}
