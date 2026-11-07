import { render } from "@testing-library/react";
import { Position, ReactFlowProvider } from "@xyflow/react";

import { FlowEdge } from "@/web/canvas/base/flow_edge.js";
import type { FlowEdgeProps } from "@/web/canvas/base/flow_edge.js";

const EDGE_BETWEEN_TWO_NODES: FlowEdgeProps = {
    id: "agent-to-output",
    source: "agent",
    target: "output",
    sourceX: 0,
    sourceY: 0,
    targetX: 200,
    targetY: 80,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
};

describe("FlowEdge", () => {
    it("draws a bezier curve between the two ports", () => {
        const edgePath = renderEdgePath(EDGE_BETWEEN_TWO_NODES);

        expect(edgePath.getAttribute("d")).toMatch(/^M0,0 C/);
        expect(edgePath).toHaveClass("flow-edge");
    });

    it("animates a dashed line while data is flowing", () => {
        const edgePath = renderEdgePath({ ...EDGE_BETWEEN_TWO_NODES, data: { flowing: true } });

        expect(edgePath).toHaveClass("flow-edge--flowing");
    });

    it("turns red when the connection is invalid", () => {
        const edgePath = renderEdgePath({ ...EDGE_BETWEEN_TWO_NODES, data: { invalid: true } });

        expect(edgePath).toHaveClass("flow-edge--invalid");
    });

    it("stays still when nothing is flowing", () => {
        const edgePath = renderEdgePath(EDGE_BETWEEN_TWO_NODES);

        expect(edgePath).not.toHaveClass("flow-edge--flowing");
        expect(edgePath).not.toHaveClass("flow-edge--invalid");
    });
});

function renderEdgePath(props: FlowEdgeProps): SVGPathElement {
    const { container } = render(
        <ReactFlowProvider>
            <svg>
                <FlowEdge {...props} />
            </svg>
        </ReactFlowProvider>,
    );

    const edgePath = container.querySelector<SVGPathElement>(".react-flow__edge-path");
    if (!edgePath) {
        throw new Error("The edge path was not rendered.");
    }

    return edgePath;
}
