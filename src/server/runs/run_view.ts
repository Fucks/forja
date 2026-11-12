import type { MapProgress } from "@/engine/map_group.js";
import { progressOfMaps } from "@/engine/map_progress.js";
import type { NodeRunState } from "@/engine/node_run_state.js";
import type { RunRecord } from "@/server/runs/run_repository.js";
import type { FlowGraph } from "@/shared/flow_graph.js";

export interface RunView {
    run: RunRecord & { flowName: string };
    nodeRuns: NodeRunState[];
    groups: Record<string, MapProgress>;
    // Of the run's version, never the draft.
    graph: FlowGraph;
    // The live screen reconnects to the event stream from here without losing events.
    lastEventId: number;
}

export function buildRunView(
    run: RunRecord,
    nodeRuns: NodeRunState[],
    graph: FlowGraph,
    flowName: string,
    lastEventId: number,
): RunView {
    return {
        run: { ...run, flowName },
        nodeRuns,
        groups: progressOfMaps(graph, nodeRuns),
        graph,
        lastEventId,
    };
}
