import type { FlowGraph } from "@/shared/flow_graph.js";

export interface GraphHistory {
    /** Records the graph as it was before a change; the undone graphs are forgotten. */
    push(graph: FlowGraph): void;
    undo(current: FlowGraph): FlowGraph | undefined;
    redo(current: FlowGraph): FlowGraph | undefined;
    readonly canUndo: boolean;
    readonly canRedo: boolean;
}

export function createHistory(limit: number): GraphHistory {
    let pastGraphs: FlowGraph[] = [];
    let futureGraphs: FlowGraph[] = [];

    return {
        push(graph) {
            pastGraphs = [...pastGraphs, graph].slice(-limit);
            futureGraphs = [];
        },
        undo(current) {
            const previous = pastGraphs.at(-1);
            if (!previous) {
                return undefined;
            }

            pastGraphs = pastGraphs.slice(0, -1);
            futureGraphs = [...futureGraphs, current];
            return previous;
        },
        redo(current) {
            const next = futureGraphs.at(-1);
            if (!next) {
                return undefined;
            }

            futureGraphs = futureGraphs.slice(0, -1);
            pastGraphs = [...pastGraphs, current];
            return next;
        },
        get canUndo() {
            return pastGraphs.length > 0;
        },
        get canRedo() {
            return futureGraphs.length > 0;
        },
    };
}
