import { ReactFlowProvider } from "@xyflow/react";
import { render, screen } from "@testing-library/react";

import type { EventEnvelope, NodeRunStatusName } from "@/shared/events.js";
import { buildLargeFlow } from "@/test/factories/large_flow_factory.js";
import { buildSerializedRunView } from "@/test/factories/run_view_factory.js";
import { measureMs } from "@/test/measure_ms.js";
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
const WORK_ITEM_COUNT = Math.ceil(
    BATCHED_EVENT_COUNT / (UPDATED_NODE_IDS.length * ALTERNATING_STATUSES.length),
);

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
        const view = buildSerializedRunView({ graph: LARGE_FLOW });

        const elapsedMs = measureMs(() => render(<RunCanvas view={view} />));

        expect(screen.getByLabelText("group_9_agent_13")).toBeInTheDocument();
        expect(elapsedMs).toBeLessThan(MOUNT_TARGET_MS * CI_SLACK_FACTOR);
    });

    it("re-renders only the nodes touched by a batch of 500 node_run.updated events", () => {
        const view = buildSerializedRunView({ graph: LARGE_FLOW });
        const { rerender } = render(<RunCanvas view={view} />);
        rendersByNodeId.clear();

        const updatedView = nodeRunUpdates(UPDATED_NODE_IDS).reduce(applyEvent, view);
        rerender(<RunCanvas view={updatedView} />);

        expect([...rendersByNodeId.keys()].sort()).toEqual([...UPDATED_NODE_IDS].sort());
    });
});

// Every status reaches every item of every node, so each node run changes state several times.
function nodeRunUpdates(nodeIds: string[]): EventEnvelope[] {
    const workItemIds = Array.from({ length: WORK_ITEM_COUNT }, (_, index) => String(index));
    const updates = ALTERNATING_STATUSES.flatMap((status) =>
        workItemIds.flatMap((workItemId) =>
            nodeIds.map((nodeId) => ({ status, workItemId, nodeId })),
        ),
    );

    return updates.slice(0, BATCHED_EVENT_COUNT).map(({ status, workItemId, nodeId }, index) => ({
        id: index + 1,
        at: "2026-01-01T12:10:00.000Z",
        event: {
            type: "node_run.updated",
            runId: "run-1",
            projectId: "project-1",
            nodeRunId: `${nodeId}-${workItemId}`,
            nodeId,
            workItemId,
            status,
            attempt: 1,
            iteration: 0,
        },
    }));
}
