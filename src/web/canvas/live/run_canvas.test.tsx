import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import { createTestQueryClient, renderWithQueryClient } from "@/test/render_with_query_client.js";
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

describe("RunCanvas node drawer", () => {
    it("opens the NodeRuns of a node when it is clicked, the running one on top", async () => {
        stubFetchRoutes({ "GET /api/runs/run-1/usage": () => Response.json([]) });
        const view = viewWithNodeRuns([
            { nodeId: "dev", workItemId: "1", status: "SUCCEEDED" },
            { nodeId: "dev", workItemId: "2", status: "SUCCEEDED" },
            { nodeId: "dev", workItemId: "3", status: "FAILED" },
            { nodeId: "dev", workItemId: "4", status: "RUNNING" },
            { nodeId: "dev", workItemId: "5", status: "QUEUED" },
        ]);
        renderWithQueryClient(<RunCanvas view={view} />);

        fireEvent.click(developerNode());

        const drawer = await screen.findByRole("dialog", { name: DEVELOPER_LABEL });
        const rows = within(drawer).getAllByRole("listitem");
        expect(rows).toHaveLength(5);
        expect(rows[0]).toHaveTextContent("item #4 · tentativa 1");
    });

    it("opens the drawer with the NodeRun given to open already selected", async () => {
        stubFetchRoutes({ "GET /api/runs/run-1/usage": () => Response.json([]) });
        const view = viewWithNodeRuns([
            { nodeId: "tl", workItemId: "1", status: "SUCCEEDED" },
            { nodeId: "dev", workItemId: "1", status: "SUCCEEDED" },
            { nodeId: "dev", workItemId: "2", status: "RUNNING" },
        ]);

        renderWithQueryClient(<RunCanvas view={view} openNodeRunId="node-run-1" />);

        const drawer = await screen.findByRole("dialog", { name: DEVELOPER_LABEL });
        expect(within(drawer).getByRole("button", { pressed: true })).toHaveTextContent(
            "item #1 · tentativa 1",
        );
    });

    it("opens nothing when a group is clicked", () => {
        renderWithQueryClient(<RunCanvas view={buildSerializedRunView()} />);

        fireEvent.click(screen.getByLabelText("Desenvolver"));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
