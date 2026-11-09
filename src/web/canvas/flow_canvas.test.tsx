import { render, screen } from "@testing-library/react";

import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { createEditorStore } from "@/web/canvas/editor_store.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { FlowCanvas } from "@/web/canvas/flow_canvas.js";

const CANONICAL_FLOW = buildCanonicalFlow();

function createCanonicalStore(): EditorStore {
    const store = createEditorStore();
    store.getState().load({
        flowId: "flw_canonico",
        graph: CANONICAL_FLOW,
        revision: 1,
        updatedAt: "2026-11-09T12:00:00Z",
    });

    return store;
}

// ResizeObserver is mocked in src/test/setup.ts, so React Flow never measures the nodes and keeps
// them hidden: the nodes are found by their labels instead of by their accessible roles.
describe("FlowCanvas", () => {
    it.each(CANONICAL_FLOW.nodes.map((node) => node.label))(
        "renders the canonical flow's %s node",
        (label) => {
            render(<FlowCanvas store={createCanonicalStore()} />);

            expect(screen.getAllByLabelText(label).length).toBeGreaterThan(0);
        },
    );

    it.each(CANONICAL_FLOW.groups.map((group) => group.label))(
        "renders the canonical flow's %s group",
        (label) => {
            render(<FlowCanvas store={createCanonicalStore()} />);

            expect(screen.getByLabelText(label)).toBeInTheDocument();
        },
    );

    it("labels each map group with its concurrency", () => {
        render(<FlowCanvas store={createCanonicalStore()} />);

        expect(screen.getByText("map ×3")).toBeInTheDocument();
    });

    it("does not mark the draft dirty just by opening it", () => {
        const store = createCanonicalStore();

        render(<FlowCanvas store={store} />);

        expect(store.getState().dirty).toBe(false);
    });
});
