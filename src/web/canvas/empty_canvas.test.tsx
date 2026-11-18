import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";

import type { FlowGraph } from "@/shared/flow_graph.js";
import type { FlowTemplateGraph, FlowTemplateSummary } from "@/shared/flow_types.js";
import { buildLoopFlow } from "@/test/factories/flow_graph_factory.js";
import { respondWithApiError, stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import { createTestQueryClient } from "@/test/render_with_query_client.js";
import { createEditorStore } from "@/web/canvas/editor_store.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { EmptyCanvas } from "@/web/canvas/empty_canvas.js";

const EMPTY_FLOW: FlowGraph = { schemaVersion: 2, nodes: [], edges: [], groups: [] };
const REVIEW_LOOP_GRAPH = buildLoopFlow();
const HTTP_INTERNAL_ERROR = 500;

const TEMPLATES: FlowTemplateSummary[] = [
    { id: "basic_factory", name: "Fábrica básica", description: "Do TL ao PR, item a item." },
    {
        id: "review_loop",
        name: "Revisão com volta",
        description: "O Dev implementa e o Reviewer revisa até aprovar.",
    },
];

describe("EmptyCanvas", () => {
    it("lists the templates with their descriptions", async () => {
        stubTemplateRoutes();
        renderEmptyCanvas();

        expect(await screen.findByRole("button", { name: /Revisão com volta/ })).toHaveTextContent(
            "O Dev implementa e o Reviewer revisa até aprovar.",
        );
        expect(screen.getByRole("button", { name: /Fábrica básica/ })).toBeInTheDocument();
    });

    it("fills the draft with the graph of the chosen template", async () => {
        stubTemplateRoutes();
        const store = renderEmptyCanvas();

        await userEvent.click(await screen.findByRole("button", { name: /Revisão com volta/ }));

        await waitFor(() => expect(store.getState().graph).toEqual(REVIEW_LOOP_GRAPH));
        expect(store.getState().dirty).toBe(true);
    });

    it("tells when the template could not be loaded and keeps the canvas empty", async () => {
        stubFetchRoutes({
            "GET /api/flow-templates": () => Response.json(TEMPLATES),
            "GET /api/flow-templates/review_loop": () =>
                respondWithApiError(HTTP_INTERNAL_ERROR, "Falha ao montar o template."),
        });
        const store = renderEmptyCanvas();

        await userEvent.click(await screen.findByRole("button", { name: /Revisão com volta/ }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Falha ao montar o template.");
        expect(store.getState().graph).toEqual(EMPTY_FLOW);
    });

    it("starts from scratch with a single Gatilho", async () => {
        stubTemplateRoutes();
        const store = renderEmptyCanvas();

        await userEvent.click(screen.getByRole("button", { name: "Começar do zero" }));

        expect(store.getState().graph.nodes).toEqual([
            expect.objectContaining({ type: "trigger", label: "Gatilho" }),
        ]);
    });
});

function stubTemplateRoutes(): void {
    const reviewLoop: FlowTemplateGraph = { graph: REVIEW_LOOP_GRAPH };
    stubFetchRoutes({
        "GET /api/flow-templates": () => Response.json(TEMPLATES),
        "GET /api/flow-templates/review_loop": () => Response.json(reviewLoop),
    });
}

function renderEmptyCanvas(): EditorStore {
    const store = createEditorStore();
    store.getState().load({
        flowId: "flw_1",
        graph: EMPTY_FLOW,
        revision: 1,
        updatedAt: "2026-11-18T12:00:00Z",
    });

    render(
        <QueryClientProvider client={createTestQueryClient()}>
            <ReactFlowProvider>
                <EmptyCanvas store={store} />
            </ReactFlowProvider>
        </QueryClientProvider>,
    );

    return store;
}
