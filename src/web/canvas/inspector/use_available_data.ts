import { useMemo } from "react";
import { useParams } from "react-router";

import { describeAvailableData } from "@/engine/available_data.js";
import type { AvailableDataOptions, DataField } from "@/engine/available_data.js";
import { lookUpPath } from "@/shared/conditions.js";
import type { NodeOutputsBySlug } from "@/shared/data_context.js";
import type { FlowGraph, NodeType, Port } from "@/shared/flow_graph.js";
import { nodeSlug } from "@/shared/node_slug.js";
import type { PickableDataField } from "@/web/canvas/inspector/data_picker.js";
import { useLastNodeRunSamples } from "@/web/canvas/inspector/use_last_node_run_sample.js";
import type {
    FlowInEditor,
    NodeRunSamples,
} from "@/web/canvas/inspector/use_last_node_run_sample.js";
import { getNodeDoc } from "@/web/docs/node_docs/node_docs.js";

type DataScope = Omit<AvailableDataOptions, "portLabels">;

interface SampleContext {
    inputs: Record<string, unknown>;
    nodes: NodeOutputsBySlug;
}

/** The data the node can read, each field with its value in the last run when there was one. */
export function useAvailableData(
    graph: FlowGraph,
    nodeId: string,
    { scope, groupId }: DataScope,
): PickableDataField[] {
    const fields = useMemo(
        () => describeAvailableData(graph, nodeId, { scope, groupId, portLabels: labelPort }),
        [graph, nodeId, scope, groupId],
    );
    const flow = useFlowInEditor();
    const samples = useLastNodeRunSamples(flow, listSampledNodeIds(nodeId, fields));

    return useMemo(
        () => withSamples(fields, buildSampleContext(graph, nodeId, samples)),
        [fields, graph, nodeId, samples],
    );
}

function labelPort(nodeType: NodeType, port: Port): string {
    const { inputs, outputs } = getNodeDoc(nodeType).ports;
    const portDoc = [...outputs, ...inputs].find((candidate) => candidate.name === port.name);

    return portDoc?.label ?? port.name;
}

function useFlowInEditor(): FlowInEditor | undefined {
    const { projectId, flowId } = useParams();
    if (projectId === undefined || flowId === undefined) {
        return undefined;
    }

    return { projectId, flowId };
}

// The node's own sample holds its inputs; the nodes the fields come from hold their outputs.
function listSampledNodeIds(nodeId: string, fields: DataField[]): string[] {
    const sourceNodeIds = fields.flatMap((field) => field.sourceNodeId ?? []);

    return [...new Set([nodeId, ...sourceNodeIds])];
}

function buildSampleContext(
    graph: FlowGraph,
    nodeId: string,
    samples: NodeRunSamples,
): SampleContext {
    const sampledOutputs = graph.nodes.flatMap<[string, Record<string, unknown>]>((node) => {
        const outputs = samples[node.id]?.outputs;
        return outputs ? [[nodeSlug(node.label), outputs]] : [];
    });

    return { inputs: samples[nodeId]?.inputs ?? {}, nodes: Object.fromEntries(sampledOutputs) };
}

function withSamples(fields: DataField[], context: SampleContext): PickableDataField[] {
    return fields.map((field) => {
        const sample = lookUpPath(context, field.path);
        if (!sample.isFound) {
            return field;
        }

        return { ...field, sampleText: describeSample(sample.value) };
    });
}

function describeSample(value: unknown): string {
    return typeof value === "string" ? value : JSON.stringify(value);
}
