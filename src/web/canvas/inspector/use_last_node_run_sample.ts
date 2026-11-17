import { useQuery } from "@tanstack/react-query";

import type { RunListItem, SerializedNodeRun, SerializedRunView } from "@/shared/run_types.js";
import { apiClient } from "@/web/api/api_client.js";
import { projectRunsPath, projectRunsQueryKey } from "@/web/app/runs/use_runs.js";
import { fetchRunView } from "@/web/canvas/live/use_live_run.js";

export interface NodeRunSample {
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
}

interface NodeInFlow {
    projectId: string;
    flowId: string;
    nodeId: string;
}

const SAMPLE_QUERY_KEY = "last-node-run-sample";
const RECENT_RUNS_SEARCHED = 5;

/** The inputs and outputs of the node in the newest of the flow's recent runs that ran it. */
export function useLastNodeRunSample(nodeInFlow: NodeInFlow): NodeRunSample | undefined {
    const { projectId, flowId, nodeId } = nodeInFlow;
    const sample = useQuery({
        // Under the project's runs key, so whatever reloads the runs reloads the sample too.
        queryKey: [...projectRunsQueryKey(projectId), SAMPLE_QUERY_KEY, flowId, nodeId],
        queryFn: () => fetchLastNodeRunSample(nodeInFlow),
    });

    return sample.data ?? undefined;
}

// React Query refuses undefined as query data, so "no sample" travels as null.
async function fetchLastNodeRunSample(nodeInFlow: NodeInFlow): Promise<NodeRunSample | null> {
    const recentRuns = await apiClient.get<RunListItem[]>(recentRunsPath(nodeInFlow));
    const runViews = await Promise.all(recentRuns.map((run) => fetchRunView(run.id)));
    const sample = runViews
        .map((view) => findLastNodeRunSample(view, nodeInFlow.nodeId))
        .find((candidate) => candidate !== undefined);

    return sample ?? null;
}

function recentRunsPath({ projectId, flowId }: NodeInFlow): string {
    const query = new URLSearchParams({ limit: String(RECENT_RUNS_SEARCHED), flowId });

    return `${projectRunsPath(projectId)}?${query.toString()}`;
}

function findLastNodeRunSample(view: SerializedRunView, nodeId: string): NodeRunSample | undefined {
    const lastNodeRun = view.nodeRuns.filter((nodeRun) => nodeRun.nodeId === nodeId).at(-1);
    if (!lastNodeRun) {
        return undefined;
    }

    return toSample(lastNodeRun);
}

function toSample(nodeRun: SerializedNodeRun): NodeRunSample {
    return { inputs: nodeRun.inputs, outputs: nodeRun.outputs };
}
