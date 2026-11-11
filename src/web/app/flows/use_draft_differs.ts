import { useMemo } from "react";

import { flowGraphSchema } from "@/shared/flow_graph.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import { normalizeFlowGraph } from "@/shared/normalize_flow_graph.js";
import { useFlowVersion } from "@/web/app/flows/use_flow_versions.js";

// Until the latest version arrives (or when there is none) the draft counts as new, so the
// publish button is never blocked by a guess; the server still checks on publish.
export function useDraftDiffers({
    flowId,
    draftGraph,
    latestVersion,
}: {
    flowId: string;
    draftGraph: FlowGraph;
    latestVersion: number | undefined;
}): boolean {
    const publishedGraph = useFlowVersion(flowId, latestVersion).data?.graph;

    return useMemo(
        () => publishedGraph === undefined || !isSameFlowGraph(draftGraph, publishedGraph),
        [draftGraph, publishedGraph],
    );
}

export function isSameFlowGraph(first: FlowGraph, second: FlowGraph): boolean {
    const firstText = toCanonicalText(first);

    return firstText !== undefined && firstText === toCanonicalText(second);
}

// Parsing puts every config's keys in schema order; the editor may have added them in any order.
function toCanonicalText(graph: FlowGraph): string | undefined {
    const parsedGraph = flowGraphSchema.safeParse(graph);
    if (!parsedGraph.success) {
        return undefined;
    }

    return JSON.stringify(normalizeFlowGraph(parsedGraph.data));
}
