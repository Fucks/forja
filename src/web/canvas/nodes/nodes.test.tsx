import { render, screen, within } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { ReactFlow, ReactFlowProvider } from "@xyflow/react";
import type { JSX } from "react";

import { isNodeOfType, NODE_TYPES } from "@/shared/flow_graph.js";
import type { FlowGraph, FlowGroup, FlowNode, NodeType } from "@/shared/flow_graph.js";
import { createDefaultNode } from "@/shared/node_defaults.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { buildMapGroup } from "@/test/factories/flow_graph_variations.js";
import { NODE_TYPE_ICONS } from "@/web/canvas/base/node_type_icons.js";
import { NODE_TYPE_LABELS } from "@/web/canvas/base/node_type_labels.js";
import { toReactFlow } from "@/web/canvas/graph_mapping.js";
import { validateFlowGraph } from "@/engine/graph_validation.js";
import { ImplicitItemOverlay } from "@/web/canvas/implicit_item_overlay.js";
import { nodeTypes } from "@/web/canvas/nodes/node_components.js";
import { NodeLiveContext, NodeLiveStore } from "@/web/canvas/nodes/node_live_context.js";
import type { NodeLiveState } from "@/web/canvas/nodes/node_live_context.js";
import { summarizeIssues } from "@/web/canvas/use_validation.js";
import type { IssuesByTarget } from "@/web/canvas/use_validation.js";
import { ValidationOverlay } from "@/web/canvas/validation_overlay.js";

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
const DEFAULT_ZOOM = 1;

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

    it("names the agent's result port and draws the JSON icon next to it", () => {
        const agent = buildNamedNode("agent");

        renderOnCanvas({ nodes: [agent] });

        const resultPort = findPortRow(screen.getByText("Resultado"));
        expect(resultPort.querySelector("svg.lucide-braces")).not.toBeNull();
    });

    it("explains the agent's result port in its tooltip", async () => {
        const user = userEvent.setup();
        renderOnCanvas({ nodes: [buildNamedNode("agent")] });

        await user.hover(screen.getByText("Resultado"));

        const tooltip = await screen.findByRole("tooltip");
        expect(tooltip).toHaveTextContent("Os dados que seguem o Formato da resposta.");
        expect(tooltip).toHaveTextContent("result · JSON · obrigatória");
    });

    it.each(NODE_TYPES)("opens the documentation of the %s node from its header", (type) => {
        renderOnCanvas({ nodes: [buildNamedNode(type)] });

        const link = screen.getByLabelText(`Documentação de ${NODE_TYPE_LABELS[type]}`);
        expect(link).toHaveAttribute("href", `/docs/nodes/${type}`);
    });

    it("marks the unwired item of a node inside a map as automatic", () => {
        renderOnCanvas(buildCanonicalFlow());

        const developer = screen.getByLabelText("Dev");
        expect(within(developer).getByText("automático")).toBeInTheDocument();
    });

    it("explains why the item inside a map needs no edge", async () => {
        const user = userEvent.setup();
        renderOnCanvas(buildCanonicalFlow());

        await user.hover(within(screen.getByLabelText("Dev")).getByText("automático"));

        expect(await screen.findByRole("tooltip")).toHaveTextContent(
            "Dentro de um Map, cada nó recebe o item que está sendo processado. Não precisa ligar.",
        );
    });

    it("does not mark the item wired from the source as automatic", () => {
        renderOnCanvas(buildCanonicalFlow());

        const techLead = screen.getByLabelText("TL");
        expect(within(techLead).queryByText("automático")).not.toBeInTheDocument();
    });

    it("does not mark the item of an agent outside a map as automatic", () => {
        renderOnCanvas({ nodes: [buildNamedNode("agent")] });

        expect(screen.queryByText("automático")).not.toBeInTheDocument();
    });

    it("marks an agent without prompt as missing configuration", () => {
        const agent = buildNamedNode("agent");

        renderOnCanvas({ nodes: [agent] }, { issuesByTarget: validate([agent]) });

        expect(screen.getByText("falta configurar")).toBeInTheDocument();
    });

    it("removes the missing configuration badge once the prompt is filled", () => {
        const agent = buildNamedNode("agent");
        const { rerender } = renderOnCanvas(
            { nodes: [agent] },
            { issuesByTarget: validate([agent]) },
        );

        const configuredAgent = withPrompt(agent, "Implemente a issue {{item.title}}");
        rerender(
            <CanvasOf
                graph={buildGraph({ nodes: [configuredAgent] })}
                state={{ issuesByTarget: validate([configuredAgent]) }}
            />,
        );

        expect(screen.queryByText("falta configurar")).not.toBeInTheDocument();
    });

    it("hides the badges when the canvas is zoomed out below 60%", () => {
        const flow = buildCanonicalFlow();
        const agent = buildNamedNode("agent");
        const elements = { ...flow, nodes: [...flow.nodes, agent] };

        renderOnCanvas(elements, { issuesByTarget: validate([agent]), zoom: 0.55 });

        expect(screen.queryByText("automático")).not.toBeInTheDocument();
        expect(screen.queryByText("falta configurar")).not.toBeInTheDocument();
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

        renderOnCanvas({ nodes: [agent] }, { liveStates });

        expect(screen.getByLabelText("Rodando")).toBeInTheDocument();
        expect(screen.getByText("item #42")).toBeInTheDocument();
    });

    it("shows no execution status in the editor", () => {
        const agent = buildNamedNode("agent");

        renderOnCanvas({ nodes: [agent] });

        expect(screen.queryByLabelText("Rodando")).not.toBeInTheDocument();
    });

    it("offers resize handles only on the selected group", () => {
        renderOnCanvas(
            { groups: [MAP_GROUP, { ...MAP_GROUP, id: "other_map" }] },
            { selectedIds: [MAP_GROUP.id] },
        );

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

        renderOnCanvas({ groups: [MAP_GROUP] }, { liveStates });

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

function withPrompt(node: FlowNode, prompt: string): FlowNode {
    if (!isNodeOfType(node, "agent")) {
        return node;
    }

    return { ...node, config: { ...node.config, prompt } };
}

function findPortRow(portLabel: HTMLElement): HTMLElement {
    const portRow = portLabel.parentElement;
    if (!portRow) {
        throw new Error("The port label is not inside a port row");
    }

    return portRow;
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

type GraphElements = Partial<Pick<FlowGraph, "nodes" | "groups" | "edges">>;

interface CanvasState {
    liveStates?: Map<string, NodeLiveState>;
    selectedIds?: string[];
    issuesByTarget?: IssuesByTarget;
    zoom?: number;
}

function renderOnCanvas(elements: GraphElements, state: CanvasState = {}): RenderResult {
    return render(<CanvasOf graph={buildGraph(elements)} state={state} />);
}

function CanvasOf({ graph, state }: { graph: FlowGraph; state: CanvasState }): JSX.Element {
    const {
        liveStates = new Map(),
        selectedIds = [],
        issuesByTarget = new Map(),
        zoom = DEFAULT_ZOOM,
    } = state;
    const { nodes, edges } = toReactFlow(graph);
    const nodesWithSelection = nodes.map((node) => ({
        ...node,
        selected: selectedIds.includes(node.id),
    }));

    return (
        <NodeLiveContext.Provider value={new NodeLiveStore(liveStates)}>
            <ImplicitItemOverlay graph={graph}>
                <ValidationOverlay issuesByTarget={issuesByTarget}>
                    <ReactFlowProvider>
                        <ReactFlow
                            nodes={nodesWithSelection}
                            edges={edges}
                            nodeTypes={nodeTypes}
                            defaultViewport={{ x: 0, y: 0, zoom }}
                        />
                    </ReactFlowProvider>
                </ValidationOverlay>
            </ImplicitItemOverlay>
        </NodeLiveContext.Provider>
    );
}

function buildGraph(elements: GraphElements): FlowGraph {
    return { schemaVersion: 1, nodes: [], groups: [], edges: [], ...elements };
}

function validate(nodes: FlowNode[]): IssuesByTarget {
    return summarizeIssues(validateFlowGraph(buildGraph({ nodes }), {})).byTarget;
}
