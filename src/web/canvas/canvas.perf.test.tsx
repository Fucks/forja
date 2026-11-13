import { ReactFlowProvider } from "@xyflow/react";
import { render, screen } from "@testing-library/react";

import type { EventEnvelope, NodeRunStatusName } from "@/shared/events.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import type { SerializedRunView } from "@/shared/run_types.js";
import { buildLargeFlow } from "@/test/factories/large_flow_factory.js";
import { buildSerializedRunView } from "@/test/factories/run_view_factory.js";
import { createEditorStore } from "@/web/canvas/editor_store.js";
import { FlowCanvas } from "@/web/canvas/flow_canvas.js";
import { RunCanvas } from "@/web/canvas/live/run_canvas.js";
import { applyEvent } from "@/web/canvas/live/run_view_model.js";
import type * as NodeLiveContextModule from "@/web/canvas/nodes/node_live_context.js";
import { ToastProvider } from "@/web/components/ui/toast.js";

const CI_SLACK_FACTOR = 2;
const MOUNT_TARGET_MS = 1_000;
const LARGE_FLOW = buildLargeFlow({ nodes: 150, groups: 10 });
const BATCHED_EVENT_COUNT = 500;
const UPDATED_NODE_IDS = ["group_0_agent_0", "group_4_agent_7", "group_9_agent_13"];
const ALTERNATING_STATUSES: NodeRunStatusName[] = ["QUEUED", "RUNNING", "SUCCEEDED"];

// Every render of a node card or group frame reads its live state exactly once.
const rendersByNodeId = vi.hoisted(() => new Map<string, number>());

vi.mock("@/web/canvas/nodes/node_live_context.js", async (importOriginal) => {
    const original = await importOriginal<typeof NodeLiveContextModule>();

    return {
        ...original,
        useNodeLiveState: (id: string) => {
            rendersByNodeId.set(id, (rendersByNodeId.get(id) ?? 0) + 1);
            return original.useNodeLiveState(id);
        },
    };
});

describe("canvas performance", () => {
    beforeEach(() => {
        rendersByNodeId.clear();
    });

    it("mounts the editor with 150 nodes in under 1 s", () => {
        const store = createEditorStore();
        store
            .getState()
            .load({ flowId: "flw_large", graph: LARGE_FLOW, revision: 1, updatedAt: "" });

        const elapsedMs = measureMs(() =>
            render(
                <ToastProvider>
                    <ReactFlowProvider>
                        <FlowCanvas store={store} issuesByTarget={new Map()} />
                    </ReactFlowProvider>
                </ToastProvider>,
            ),
        );

        expect(screen.getByLabelText("group_9_agent_13")).toBeInTheDocument();
        expect(elapsedMs).toBeLessThan(MOUNT_TARGET_MS * CI_SLACK_FACTOR);
    });

    it("mounts the run view with 150 nodes in under 1 s", () => {
        const view = buildLargeRunView(LARGE_FLOW);

        const elapsedMs = measureMs(() => render(<RunCanvas view={view} />));

        expect(screen.getByLabelText("group_9_agent_13")).toBeInTheDocument();
        expect(elapsedMs).toBeLessThan(MOUNT_TARGET_MS * CI_SLACK_FACTOR);
    });

    it("re-renders only the nodes touched by a batch of 500 node_run.updated events", () => {
        const view = buildLargeRunView(LARGE_FLOW);
        const { rerender } = render(<RunCanvas view={view} />);
        rendersByNodeId.clear();

        const updatedView = nodeRunUpdates(UPDATED_NODE_IDS).reduce(applyEvent, view);
        rerender(<RunCanvas view={updatedView} />);

        expect([...rendersByNodeId.keys()].sort()).toEqual([...UPDATED_NODE_IDS].sort());
    });
});

function measureMs(work: () => void): number {
    const startedAtMs = performance.now();
    work();

    return performance.now() - startedAtMs;
}

function buildLargeRunView(graph: FlowGraph): SerializedRunView {
    return buildSerializedRunView({ graph });
}

// The events cycle through statuses for many items, all of them on the given nodes.
function nodeRunUpdates(nodeIds: string[]): EventEnvelope[] {
    return Array.from({ length: BATCHED_EVENT_COUNT }, (_, index) => {
        const nodeId = nodeIds[index % nodeIds.length] ?? "";
        const workItemId = String(index % (BATCHED_EVENT_COUNT / ALTERNATING_STATUSES.length));

        return {
            id: index + 1,
            at: "2026-01-01T12:10:00.000Z",
            event: {
                type: "node_run.updated",
                runId: "run-1",
                projectId: "project-1",
                nodeRunId: `${nodeId}-${workItemId}`,
                nodeId,
                workItemId,
                status: ALTERNATING_STATUSES[index % ALTERNATING_STATUSES.length] ?? "RUNNING",
                attempt: 1,
                iteration: 0,
            },
        };
    });
}
