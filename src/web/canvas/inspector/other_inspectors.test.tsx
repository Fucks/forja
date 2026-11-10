import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { Mock } from "vitest";

import { isNodeOfType } from "@/shared/flow_graph.js";
import type { FlowGraph, FlowNode, NodeOfType, NodeType } from "@/shared/flow_graph.js";
import { buildCanonicalFlow, createNodeOfType } from "@/test/factories/flow_graph_factory.js";
import type { InspectorComponent } from "@/web/canvas/inspector/inspector_registry.js";
import { SourceInspector } from "@/web/canvas/inspector/source_inspector.js";

type NodeUpdate = (node: FlowNode) => FlowNode;
type NodeChangeSpy = Mock<(update: NodeUpdate) => void>;

const GRAPH = buildCanonicalFlow();
const ORIGIN = { x: 0, y: 0 };

describe("SourceInspector", () => {
    it("applies a limit within 1 and 100", async () => {
        const source = createNodeOfType("source", "source", ORIGIN);
        const inspector = renderInspector(SourceInspector, source);

        await replaceFieldText(screen.getByRole("spinbutton", { name: "Limite de itens" }), "10");

        expect(inspector.lastChangedNode("source").config.limit).toBe(10);
    });

    it.each(["0", "101"])("refuses the limit %s and keeps the node unchanged", async (limit) => {
        const source = createNodeOfType("source", "source", ORIGIN);
        const inspector = renderInspector(SourceInspector, source);

        await replaceFieldText(screen.getByRole("spinbutton", { name: "Limite de itens" }), limit);

        expect(screen.getByText("Use um número inteiro entre 1 e 100.")).toBeInTheDocument();
        expect(inspector.onChange).not.toHaveBeenCalled();
    });

    it("stops skipping blocked issues", async () => {
        const source = createNodeOfType("source", "source", ORIGIN);
        const inspector = renderInspector(SourceInspector, source);

        await userEvent.click(screen.getByRole("switch", { name: "Pular issues bloqueadas" }));

        expect(inspector.lastChangedNode("source").config.skipBlocked).toBe(false);
    });
});

interface RenderedInspector {
    onChange: NodeChangeSpy;
    lastChangedNode: <Type extends NodeType>(type: Type) => NodeOfType<Type>;
}

function renderInspector(
    Inspector: InspectorComponent,
    node: FlowNode,
    graph: FlowGraph = GRAPH,
): RenderedInspector {
    const onChange: NodeChangeSpy = vi.fn();
    render(
        <MemoryRouter>
            <Inspector node={node} graph={graph} onChange={onChange} />
        </MemoryRouter>,
    );

    return {
        onChange,
        lastChangedNode: (type) => requireNodeOfType(applyLastUpdate(onChange, node), type),
    };
}

async function replaceFieldText(field: HTMLElement, text: string): Promise<void> {
    await userEvent.clear(field);
    await userEvent.type(field, text);
    await userEvent.tab();
}

function applyLastUpdate(onChange: NodeChangeSpy, node: FlowNode): FlowNode {
    const lastCall = onChange.mock.lastCall;
    if (!lastCall) {
        throw new Error("The inspector did not change the node");
    }

    return lastCall[0](node);
}

function requireNodeOfType<Type extends NodeType>(node: FlowNode, type: Type): NodeOfType<Type> {
    if (!isNodeOfType(node, type)) {
        throw new Error(`Node ${node.id} is not a ${type} node`);
    }

    return node;
}
