import { Controls, MiniMap, ReactFlow } from "@xyflow/react";
import type { Edge, EdgeTypes, Node, NodeProps, NodeTypes } from "@xyflow/react";
import type { JSX } from "react";

import { StyleguideSection } from "@/web/app/styleguide/styleguide_section.js";
import { BaseNode } from "@/web/canvas/base/base_node.js";
import type { BaseNodeProps } from "@/web/canvas/base/base_node.js";
import { CanvasBackground } from "@/web/canvas/base/canvas_background.js";
import { FlowEdge } from "@/web/canvas/base/flow_edge.js";
import type { FlowEdgeData } from "@/web/canvas/base/flow_edge.js";
import { GroupFrame } from "@/web/canvas/base/group_frame.js";
import type { GroupFrameProps } from "@/web/canvas/base/group_frame.js";
import { NODE_TYPE_ICONS } from "@/web/canvas/base/node_type_icons.js";
import {
    EXECUTION_STATUS_STYLES,
    EXECUTION_STATUSES,
} from "@/web/components/ui/execution_status.js";

type BaseNodeSample = Node<{ node: BaseNodeProps }, "baseNode">;
type GroupFrameSample = Node<{ group: GroupFrameProps }, "groupFrame">;

const SAMPLE_NODE_TYPES: NodeTypes = {
    baseNode: ({ data }: NodeProps<BaseNodeSample>) => <BaseNode {...data.node} />,
    groupFrame: ({ data }: NodeProps<GroupFrameSample>) => <GroupFrame {...data.group} />,
};

const SAMPLE_EDGE_TYPES: EdgeTypes = { flow: FlowEdge };

const GRID_COLUMNS = 4;
const GRID_COLUMN_WIDTH_PX = 280;
const GRID_ROW_HEIGHT_PX = 200;
const GROUP_WIDTH_PX = 260;
const EDGE_LENGTH_IN_COLUMNS = 2;
const GROUP_HEIGHT_PX = 120;

const AGENT_NODE: BaseNodeProps = {
    typeIcon: NODE_TYPE_ICONS.agent,
    typeLabel: "Agente",
    label: "Implementar issue",
    summary: "opus · effort high",
    inputs: [
        { name: "issue", type: "Issue", required: true },
        { name: "notes", type: "string", required: false },
    ],
    outputs: [{ name: "branch", type: "string" }],
};

const NODE_STATE_SAMPLES: BaseNodeProps[] = [
    { ...AGENT_NODE, label: "Sem execução" },
    { ...AGENT_NODE, label: "Selecionado", selected: true },
    { ...AGENT_NODE, label: "Inválido", invalid: true },
    { ...AGENT_NODE, label: "Compacto", compact: true },
    ...EXECUTION_STATUSES.map((status) => ({
        ...AGENT_NODE,
        label: EXECUTION_STATUS_STYLES[status].label,
        status,
        badge: "item #42",
    })),
];

const GROUP_SAMPLES: GroupFrameProps[] = [
    {
        kind: "map",
        label: "Issues abertas",
        configLabel: "map ×3",
        progress: { queued: 1, running: 2, succeeded: 4, failed: 0 },
    },
    { kind: "loop", label: "Revisão", configLabel: "loop ≤5" },
    { kind: "loop", label: "Selecionado", configLabel: "loop ≤5", selected: true },
    { kind: "map", label: "Inválido", configLabel: "map ×3", invalid: true },
];

const EDGE_SAMPLES: { label: string; data: FlowEdgeData }[] = [
    { label: "Aresta parada", data: {} },
    { label: "Dado fluindo", data: { flowing: true } },
    { label: "Conexão inválida", data: { invalid: true } },
];

export function BaseNodeSamples(): JSX.Element {
    const nodes: BaseNodeSample[] = NODE_STATE_SAMPLES.map((node, index) => ({
        id: `node-${index}`,
        type: "baseNode",
        position: gridPosition(index),
        data: { node },
    }));

    return (
        <StyleguideSection title="BaseNode">
            <SampleCanvas nodes={nodes} />
        </StyleguideSection>
    );
}

export function GroupFrameSamples(): JSX.Element {
    const nodes: GroupFrameSample[] = GROUP_SAMPLES.map((group, index) => ({
        id: `group-${index}`,
        type: "groupFrame",
        position: gridPosition(index),
        style: { width: GROUP_WIDTH_PX, height: GROUP_HEIGHT_PX },
        data: { group },
    }));

    return (
        <StyleguideSection title="GroupFrame">
            <SampleCanvas nodes={nodes} />
        </StyleguideSection>
    );
}

export function FlowEdgeSamples(): JSX.Element {
    const nodes = EDGE_SAMPLES.flatMap(({ label }, row) => createEdgeEndpoints(label, row));
    const edges: Edge[] = EDGE_SAMPLES.map(({ data }, row) => ({
        id: `edge-${row}`,
        type: "flow",
        source: `edge-${row}-source`,
        sourceHandle: "saída",
        target: `edge-${row}-target`,
        targetHandle: "entrada",
        data,
    }));

    return (
        <StyleguideSection title="FlowEdge">
            <SampleCanvas nodes={nodes} edges={edges} />
        </StyleguideSection>
    );
}

function createEdgeEndpoints(label: string, row: number): BaseNodeSample[] {
    const source: BaseNodeProps = {
        typeIcon: NODE_TYPE_ICONS.script,
        typeLabel: "Script",
        label,
        inputs: [],
        outputs: [{ name: "saída", type: "string" }],
    };
    const target: BaseNodeProps = {
        typeIcon: NODE_TYPE_ICONS.output,
        typeLabel: "Saída",
        label,
        inputs: [{ name: "entrada", type: "string", required: true }],
        outputs: [],
    };

    return [
        {
            id: `edge-${row}-source`,
            type: "baseNode",
            position: gridPosition(row * GRID_COLUMNS),
            data: { node: source },
        },
        {
            id: `edge-${row}-target`,
            type: "baseNode",
            position: gridPosition(row * GRID_COLUMNS + EDGE_LENGTH_IN_COLUMNS),
            data: { node: target },
        },
    ];
}

function SampleCanvas({ nodes, edges = [] }: { nodes: Node[]; edges?: Edge[] }): JSX.Element {
    return (
        <div className="h-[480px] overflow-hidden rounded-md border border-border">
            <ReactFlow
                defaultNodes={nodes}
                defaultEdges={edges}
                nodeTypes={SAMPLE_NODE_TYPES}
                edgeTypes={SAMPLE_EDGE_TYPES}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                fitView
            >
                <CanvasBackground />
                <Controls showInteractive={false} />
                <MiniMap />
            </ReactFlow>
        </div>
    );
}

function gridPosition(index: number): { x: number; y: number } {
    return {
        x: (index % GRID_COLUMNS) * GRID_COLUMN_WIDTH_PX,
        y: Math.floor(index / GRID_COLUMNS) * GRID_ROW_HEIGHT_PX,
    };
}
