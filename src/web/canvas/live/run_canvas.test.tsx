import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { JSX } from "react";

import type { EventEnvelope } from "@/shared/events.js";
import type { SerializedNodeRun, SerializedRunView } from "@/shared/run_types.js";
import {
    buildSerializedNodeRun,
    buildSerializedRunView,
} from "@/test/factories/run_view_factory.js";
import { createFakeEventSourceFactory } from "@/test/fakes/fake_event_source.js";
import type { FakeEventSourceFactory } from "@/test/fakes/fake_event_source.js";
import { stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import { createTestQueryClient } from "@/test/render_with_query_client.js";
import { RunCanvas } from "@/web/canvas/live/run_canvas.js";
import { useLiveRun } from "@/web/canvas/live/use_live_run.js";

const DEVELOPER_LABEL = "Dev";
const RUNNING_LABEL = "Rodando";
const LIVE_UPDATE_BUDGET_MS = 500;

// ResizeObserver is mocked in src/test/setup.ts, so React Flow keeps the nodes hidden: they are
// found by their labels instead of by their accessible roles.
describe("RunCanvas", () => {
    it("shows the state of each node", () => {
        const view = viewWithNodeRuns([
            { nodeId: "tl", workItemId: "42", status: "SUCCEEDED" },
            { nodeId: "dev", workItemId: "42", status: "RUNNING" },
        ]);

        render(<RunCanvas view={view} />);

        expect(developerNode()).toHaveTextContent("item #42");
        expect(developerNode().querySelector(`[aria-label="${RUNNING_LABEL}"]`)).not.toBeNull();
        expect(developerNode()).toHaveClass("animate-ember");
        expect(screen.getByLabelText("TL").querySelector('[aria-label="Sucesso"]')).not.toBeNull();
    });

    it("shows the counters of the map groups", () => {
        const view = buildSerializedRunView({
            groups: { develop: { queued: 1, running: 2, succeeded: 4, failed: 0 } },
        });

        render(<RunCanvas view={view} />);

        expect(screen.getByText("2 rodando · 1 na fila · 4 feitos")).toBeInTheDocument();
    });

    it("shows only the state of the chosen item", () => {
        const view = viewWithNodeRuns([
            { nodeId: "dev", workItemId: "41", status: "RUNNING" },
            { nodeId: "dev", workItemId: "42", status: "QUEUED" },
        ]);

        render(<RunCanvas view={view} filterItemId="42" />);

        expect(developerNode().querySelector('[aria-label="Na fila"]')).not.toBeNull();
        expect(developerNode()).not.toHaveClass("animate-ember");
    });
});

describe("RunCanvas with the live run", () => {
    let eventSources: FakeEventSourceFactory;

    beforeEach(() => {
        eventSources = createFakeEventSourceFactory();
        stubFetchRoutes({ "GET /api/runs/run-1": () => Response.json(buildSerializedRunView()) });
    });

    function LiveRunCanvas(): JSX.Element | null {
        const { view } = useLiveRun("run-1", eventSources.createSource);
        return view ? <RunCanvas view={view} /> : null;
    }

    it("makes a node glow soon after the event says it runs", async () => {
        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <LiveRunCanvas />
            </QueryClientProvider>,
        );
        await screen.findByLabelText(DEVELOPER_LABEL);

        act(() => eventSources.latestSource().emit(developerStartsRunning()));

        await waitFor(() => expect(developerNode()).toHaveClass("animate-ember"), {
            timeout: LIVE_UPDATE_BUDGET_MS,
        });
    });
});

function developerNode(): HTMLElement {
    return screen.getByLabelText(DEVELOPER_LABEL);
}

function viewWithNodeRuns(nodeRuns: Partial<SerializedNodeRun>[]): SerializedRunView {
    return buildSerializedRunView({
        nodeRuns: nodeRuns.map((nodeRun, index) =>
            buildSerializedNodeRun({ id: `node-run-${index}`, ...nodeRun }),
        ),
    });
}

function developerStartsRunning(): EventEnvelope {
    return {
        id: 1,
        at: "2026-01-01T12:10:00.000Z",
        event: {
            type: "node_run.updated",
            runId: "run-1",
            projectId: "project-1",
            nodeRunId: "node-run-7",
            nodeId: "dev",
            workItemId: "42",
            status: "RUNNING",
            attempt: 1,
            iteration: 0,
        },
    };
}
