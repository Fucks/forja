import { render, screen } from "@testing-library/react";
import { ReactFlow, ReactFlowProvider } from "@xyflow/react";
import type { JSX } from "react";

import { isNodeOfType, NODE_TYPES } from "@/shared/flow_graph.js";
import type { FlowGraph, FlowGroup, FlowNode, NodeType } from "@/shared/flow_graph.js";
import { createDefaultNode } from "@/shared/node_defaults.js";
import { buildMapGroup } from "@/test/factories/flow_graph_variations.js";
import { NODE_TYPE_ICONS } from "@/web/canvas/base/node_type_icons.js";
import { NODE_TYPE_LABELS } from "@/web/canvas/base/node_type_labels.js";
import { toReactFlow } from "@/web/canvas/graph_mapping.js";
import { nodeTypes } from "@/web/canvas/nodes/node_components.js";
import { NodeLiveContext, NodeLiveStore } from "@/web/canvas/nodes/node_live_context.js";
import type { NodeLiveState } from "@/web/canvas/nodes/node_live_context.js";

const LOOP_GROUP: FlowGroup = {
    ...buildMapGroup("revisao"),
    kind: "loop",
    label: "Revisão",
    config: {
        maxIterations: 3,
        until: { op: "eq", path: "review.approved", value: true },
        carry: [],
    },
};

const MAP_GROUP: FlowGroup = {
    ...buildMapGroup("desenvolver"),
    kind: "map",
    label: "Desenvolver",
    config: { concurrency: 3, barrier: false, failFast: false },
};

const LUCIDE_ICON_PREFIX = "lucide-";

const EXPECTED_SUMMARIES: Record<NodeType, string> = {
    trigger: "manual",
    source: "GitHub · até 20",
    agent: "padrão · effort padrão",
    script: "npm test",
    condition: "approved = true",
    gate: "Revise o pull request",
    git: "abrir PR",
    output: "mover para Concluído",
};

// ResizeObserver is mocked in src/test/setup.ts, so React Flow keeps the nodes hidden: they are
// found by their labels instead of by their accessible roles.
describe("canvas node components", () => {
    it.each(NODE_TYPES)("renders a %s node with its type label and summary", (type) => {
        const node = buildNamedNode(type);

        renderOnCanvas({ nodes: [node] });

        expect(screen.getByLabelText(node.label)).toBeInTheDocument();
        expect(screen.getByText(NODE_TYPE_LABELS[type])).toBeInTheDocument();
        expect(screen.getByText(EXPECTED_SUMMARIES[type])).toBeInTheDocument();
    });

    it.each(NODE_TYPES)("draws the %s node with its type icon", (type) => {
        const node = buildNamedNode(type);

        renderOnCanvas({ nodes: [node] });

        const nodeElement = screen.getByLabelText(node.label);
        expect(nodeElement.querySelector(`svg.${iconClassOf(type)}`)).not.toBeNull();
    });

    it("shows the agent's workspace and iteration cap on the second line", () => {
        const agent = buildNamedNode("agent");

        renderOnCanvas({ nodes: [agent] });

        expect(screen.getByText("workspace do item · até 1 iteração")).toBeInTheDocument();
    });

    it("labels the groups with their configuration", () => {
        renderOnCanvas({ groups: [MAP_GROUP, LOOP_GROUP] });

        expect(screen.getByText("map ×3")).toBeInTheDocument();
        expect(screen.getByText("loop ≤3")).toBeInTheDocument();
    });

    it("shows the execution status the live context gives the node", () => {
        const agent = buildNamedNode("agent");
        const liveStates = new Map<string, NodeLiveState>([
            [agent.id, { status: "RUNNING", badge: "item #42" }],
        ]);

        renderOnCanvas({ nodes: [agent] }, liveStates);

        expect(screen.getByLabelText("Rodando")).toBeInTheDocument();
        expect(screen.getByText("item #42")).toBeInTheDocument();
    });

    it("shows no execution status in the editor", () => {
        const agent = buildNamedNode("agent");

        renderOnCanvas({ nodes: [agent] });

        expect(screen.queryByLabelText("Rodando")).not.toBeInTheDocument();
    });

    it("offers resize handles only on the selected group", () => {
        renderOnCanvas({ groups: [MAP_GROUP, { ...MAP_GROUP, id: "other_map" }] }, undefined, [
            MAP_GROUP.id,
        ]);

        const resizableGroups = document.querySelectorAll(
            ".react-flow__node:has(.react-flow__resize-control)",
        );
        expect([...resizableGroups].map((group) => group.getAttribute("data-id"))).toEqual([
            MAP_GROUP.id,
        ]);
    });

    it("shows the group progress the live context gives the group", () => {
        const liveStates = new Map<string, NodeLiveState>([
            [MAP_GROUP.id, { progress: { queued: 1, running: 2, succeeded: 0, failed: 0 } }],
        ]);

        renderOnCanvas({ groups: [MAP_GROUP] }, liveStates);

        expect(screen.getByText("2 rodando · 1 na fila")).toBeInTheDocument();
    });
});

function buildNamedNode(type: NodeType): FlowNode {
    const node = { ...createDefaultNode(type, `${type}_1`, { x: 0, y: 0 }), label: `Nó ${type}` };
    if (isNodeOfType(node, "script")) {
        return { ...node, config: { ...node.config, command: "npm test" } };
    }
    if (isNodeOfType(node, "gate")) {
        return { ...node, config: { ...node.config, message: "Revise o pull request" } };
    }

    return node;
}

function iconClassOf(type: NodeType): string {
    const { container } = render(<IconOf type={type} />);
    const iconClasses = [...(container.querySelector("svg")?.classList ?? [])];
    const iconClass = iconClasses.find((className) => className.startsWith(LUCIDE_ICON_PREFIX));
    container.remove();

    if (iconClass === undefined) {
        throw new Error(`The ${type} icon has no ${LUCIDE_ICON_PREFIX}* class`);
    }

    return iconClass;
}

function IconOf({ type }: { type: NodeType }): JSX.Element {
    const Icon = NODE_TYPE_ICONS[type];
    return <Icon />;
}

function renderOnCanvas(
    elements: Partial<Pick<FlowGraph, "nodes" | "groups">>,
    liveStates = new Map<string, NodeLiveState>(),
    selectedIds: string[] = [],
): void {
    const graph: FlowGraph = { schemaVersion: 1, nodes: [], groups: [], edges: [], ...elements };
    const { nodes, edges } = toReactFlow(graph);
    const nodesWithSelection = nodes.map((node) => ({
        ...node,
        selected: selectedIds.includes(node.id),
    }));

    render(
        <NodeLiveContext.Provider value={new NodeLiveStore(liveStates)}>
            <ReactFlowProvider>
                <ReactFlow nodes={nodesWithSelection} edges={edges} nodeTypes={nodeTypes} />
            </ReactFlowProvider>
        </NodeLiveContext.Provider>,
    );
}
