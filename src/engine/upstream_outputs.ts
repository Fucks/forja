import { listUpstreamNodes } from "@/engine/graph_queries.js";
import type { NodeRunState } from "@/engine/node_run_state.js";
import type { NodeOutputsBySlug } from "@/shared/data_context.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import { nodeSlug } from "@/shared/node_slug.js";

type FindNodeRun = (nodeId: string, workItemId: string | undefined) => NodeRunState | undefined;

/** The outputs of each upstream node that succeeded, by node slug: the `nodes` of the DataContext. */
export function collectUpstreamOutputs(
    graph: FlowGraph,
    nodeId: string,
    workItemId: string | undefined,
    findNodeRun: FindNodeRun,
): NodeOutputsBySlug {
    const outputsBySlug: NodeOutputsBySlug = {};
    for (const upstreamNode of listUpstreamNodes(graph, nodeId)) {
        const nodeRun = findNodeRunOfItemOrRun(findNodeRun, upstreamNode.id, workItemId);
        const outputs = succeededOutputsOf(nodeRun);
        if (outputs) {
            outputsBySlug[nodeSlug(upstreamNode.label)] = outputs;
        }
    }

    return outputsBySlug;
}

// A node that runs per item has a NodeRun for each item; one that runs once per run has a single
// NodeRun without item, which every item downstream shares.
function findNodeRunOfItemOrRun(
    findNodeRun: FindNodeRun,
    nodeId: string,
    workItemId: string | undefined,
): NodeRunState | undefined {
    return findNodeRun(nodeId, workItemId) ?? findNodeRun(nodeId, undefined);
}

function succeededOutputsOf(
    nodeRun: NodeRunState | undefined,
): Record<string, unknown> | undefined {
    if (nodeRun?.status !== "SUCCEEDED") {
        return undefined;
    }

    return nodeRun.outputs;
}
