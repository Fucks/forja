import { useQuery } from "@tanstack/react-query";

import type { RunListItem, SerializedNodeRun, SerializedRunView } from "@/shared/run_types.js";
import { apiClient } from "@/web/api/api_client.js";
import { projectRunsPath, projectRunsQueryKey } from "@/web/app/runs/use_runs.js";
import { fetchRunView } from "@/web/canvas/live/use_live_run.js";

export interface NodeRunSample {
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
}

export interface FlowInEditor {
    projectId: string;
    flowId: string;
}

interface NodeInFlow extends FlowInEditor {
    nodeId: string;
}

export type NodeRunSamples = Record<string, NodeRunSample>;

const SAMPLE_QUERY_KEY = "last-node-run-sample";
const SAMPLES_QUERY_KEY = "last-node-run-samples";
const RECENT_RUNS_SEARCHED = 5;
const NO_SAMPLES: NodeRunSamples = {};

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

/** The last sample of each node, by node id; outside a flow in the editor there are none. */
export function useLastNodeRunSamples(
    flow: FlowInEditor | undefined,
    nodeIds: string[],
): NodeRunSamples {
    const samples = useQuery({
        queryKey: [
            ...projectRunsQueryKey(flow?.projectId ?? ""),
            SAMPLES_QUERY_KEY,
            flow?.flowId,
            nodeIds,
        ],
        queryFn: () => (flow ? fetchLastNodeRunSamples(flow, nodeIds) : NO_SAMPLES),
        enabled: flow !== undefined,
    });

    return samples.data ?? NO_SAMPLES;
}

// React Query refuses undefined as query data, so "no sample" travels as null.
async function fetchLastNodeRunSample(nodeInFlow: NodeInFlow): Promise<NodeRunSample | null> {
    const samples = await fetchLastNodeRunSamples(nodeInFlow, [nodeInFlow.nodeId]);

    return samples[nodeInFlow.nodeId] ?? null;
}

async function fetchLastNodeRunSamples(
    flow: FlowInEditor,
    nodeIds: string[],
): Promise<NodeRunSamples> {
    const recentRuns = await apiClient.get<RunListItem[]>(recentRunsPath(flow));
    const runViews = await Promise.all(recentRuns.map((run) => fetchRunView(run.id)));
    const sampledNodes = nodeIds.flatMap<[string, NodeRunSample]>((nodeId) => {
        const sample = findNewestNodeRunSample(runViews, nodeId);
        return sample ? [[nodeId, sample]] : [];
    });

    return Object.fromEntries(sampledNodes);
}

function recentRunsPath({ projectId, flowId }: FlowInEditor): string {
    const query = new URLSearchParams({ limit: String(RECENT_RUNS_SEARCHED), flowId });

    return `${projectRunsPath(projectId)}?${query.toString()}`;
}

function findNewestNodeRunSample(
    runViews: SerializedRunView[],
    nodeId: string,
): NodeRunSample | undefined {
    return runViews
        .map((view) => findNodeRunSampleInRun(view, nodeId))
        .find((candidate) => candidate !== undefined);
}

function findNodeRunSampleInRun(
    view: SerializedRunView,
    nodeId: string,
): NodeRunSample | undefined {
    const lastNodeRun = view.nodeRuns.filter((nodeRun) => nodeRun.nodeId === nodeId).at(-1);
    if (!lastNodeRun) {
        return undefined;
    }

    return toSample(lastNodeRun);
}

function toSample(nodeRun: SerializedNodeRun): NodeRunSample {
    return { inputs: nodeRun.inputs, outputs: nodeRun.outputs };
}
