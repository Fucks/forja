import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { JSX } from "react";

import type { EventEnvelope, NodeRunStatusName } from "@/shared/events.js";
import type { FlowNode } from "@/shared/flow_graph.js";
import type {
    SerializedNodeRun,
    SerializedNodeRunDetail,
    SerializedRunView,
} from "@/shared/run_types.js";
import type { UsageRecord } from "@/shared/usage_types.js";
import {
    buildSerializedNodeRun,
    buildSerializedRunView,
} from "@/test/factories/run_view_factory.js";
import { createFakeEventSourceFactory } from "@/test/fakes/fake_event_source.js";
import type { FakeEventSourceFactory } from "@/test/fakes/fake_event_source.js";
import { listSentWrites, stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import type { FakeRoutes } from "@/test/fakes/fake_fetch.js";
import { createTestQueryClient } from "@/test/render_with_query_client.js";
import { NodeRunDrawer } from "@/web/canvas/live/node_run_drawer.js";
import { useLiveRun } from "@/web/canvas/live/use_live_run.js";

const DEVELOPER_NODE_ID = "dev";
const RUN_URL = "/api/runs/run-1";
const RUN_USAGE_URL = `${RUN_URL}/usage`;
const NODE_RUN_URL = "/api/node-runs/node-run-0";
const HTTP_NO_CONTENT = 204;
const LONG_TEXT_LENGTH = 500;

describe("NodeRunDrawer", () => {
    it("lists the NodeRuns of the node with the running one on top", () => {
        stubFetchRoutes(fakeNodeRunApi());
        const view = viewWithDeveloperRuns([
            { workItemId: "1", status: "SUCCEEDED" },
            { workItemId: "2", status: "FAILED" },
            { workItemId: "2", attempt: 2, status: "SUCCEEDED" },
            { workItemId: "3", status: "SUCCEEDED" },
            { workItemId: "4", status: "RUNNING" },
            { workItemId: "5", status: "QUEUED" },
            { nodeId: "tl", workItemId: "1", status: "SUCCEEDED" },
        ]);

        renderDrawer(view);

        expect(listedNodeRuns()).toEqual([
            "item #4 · tentativa 1",
            "item #1 · tentativa 1",
            "item #2 · tentativa 2",
            "item #2 · tentativa 1",
            "item #3 · tentativa 1",
            "item #5 · tentativa 1",
        ]);
    });

    it("shows the cost and the duration of each NodeRun", async () => {
        stubFetchRoutes(
            fakeNodeRunApi({
                usage: [usageOf("node-run-0", 0.1), usageOf("node-run-0", 0.25)],
            }),
        );
        const view = viewWithDeveloperRuns([
            {
                workItemId: "1",
                status: "SUCCEEDED",
                startedAt: "2026-01-01T12:00:00.000Z",
                finishedAt: "2026-01-01T12:01:30.000Z",
            },
        ]);

        renderDrawer(view);

        const row = nodeRunRow("item #1 · tentativa 1");
        expect(await within(row).findByText("US$ 0,35")).toBeInTheDocument();
        expect(row).toHaveTextContent("1 min 30 s");
    });
});

describe("NodeRunDrawer detail", () => {
    it("shows the inputs and the outputs of the selected NodeRun as JSON", async () => {
        const nodeRun = developerRun({
            inputs: { spec: { title: "Login com GitHub" } },
            outputs: { summary: "Feito" },
        });
        stubFetchRoutes(fakeNodeRunApi({ details: [detailOf(nodeRun)] }));
        renderDrawer(buildSerializedRunView({ nodeRuns: [nodeRun] }));

        await selectNodeRun("item #1 · tentativa 1");

        const inputs = await screen.findByRole("region", { name: "Entradas" });
        expect(within(inputs).getByText("spec:")).toBeInTheDocument();
        expect(within(inputs).getByText('"Login com GitHub"')).toBeInTheDocument();
        await userEvent.click(screen.getByRole("tab", { name: "Saídas" }));
        const outputs = await screen.findByRole("region", { name: "Saídas" });
        expect(within(outputs).getByText('"Feito"')).toBeInTheDocument();
    });

    it("shows a long text in full only when asked", async () => {
        const longText = "a".repeat(LONG_TEXT_LENGTH);
        const nodeRun = developerRun({ inputs: { spec: longText } });
        stubFetchRoutes(fakeNodeRunApi({ details: [detailOf(nodeRun)] }));
        renderDrawer(buildSerializedRunView({ nodeRuns: [nodeRun] }));

        await selectNodeRun("item #1 · tentativa 1");
        const inputs = await screen.findByRole("region", { name: "Entradas" });
        expect(inputs).not.toHaveTextContent(longText);
        await userEvent.click(within(inputs).getByRole("button", { name: "ver tudo" }));

        expect(inputs).toHaveTextContent(longText);
    });
    it("shows the translated kind and the message of a structured output error", async () => {
        const nodeRun = developerRun({
            status: "FAILED",
            error: { kind: "structured_output", message: "O campo approved está ausente." },
        });
        stubFetchRoutes(fakeNodeRunApi({ details: [detailOf(nodeRun)] }));
        renderDrawer(buildSerializedRunView({ nodeRuns: [nodeRun] }));

        await selectNodeRun("item #1 · tentativa 1");

        const error = await screen.findByRole("region", { name: "Erro" });
        expect(error).toHaveTextContent("Saída estruturada inválida");
        expect(error).toHaveTextContent("O campo approved está ausente.");
    });
});

describe("NodeRunDrawer actions", () => {
    let eventSources: FakeEventSourceFactory;

    beforeEach(() => {
        eventSources = createFakeEventSourceFactory();
    });

    function LiveNodeRunDrawer(): JSX.Element | null {
        const { view } = useLiveRun("run-1", eventSources.createSource);
        if (!view) {
            return null;
        }

        return <NodeRunDrawer view={view} node={developerNodeOf(view)} onClose={() => undefined} />;
    }

    async function renderLiveDrawer(): Promise<void> {
        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <LiveNodeRunDrawer />
            </QueryClientProvider>,
        );
        await screen.findByRole("list", { name: "Execuções do nó" });
    }

    it("retries a failed NodeRun and lists the new attempt as it arrives", async () => {
        const failedNodeRun = developerRun({ status: "FAILED" });
        const fetchSpy = stubFetchRoutes(fakeLiveRunApi(failedNodeRun));
        await renderLiveDrawer();

        await selectNodeRun("item #1 · tentativa 1");
        await userEvent.click(screen.getByRole("button", { name: "Repetir" }));
        await userEvent.click(screen.getByRole("button", { name: "Repetir execução" }));
        act(() => eventSources.latestSource().emit(developerAttemptChanges(2, "QUEUED")));

        expect(await screen.findByText("item #1 · tentativa 2")).toBeInTheDocument();
        expect(listSentWrites(fetchSpy).map((write) => write.url)).toEqual([
            `${NODE_RUN_URL}/retry`,
        ]);
    });

    it("cancels a running NodeRun only after the confirmation", async () => {
        const runningNodeRun = developerRun({ status: "RUNNING" });
        const fetchSpy = stubFetchRoutes(fakeLiveRunApi(runningNodeRun));
        await renderLiveDrawer();

        await selectNodeRun("item #1 · tentativa 1");
        await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
        expect(listSentWrites(fetchSpy)).toEqual([]);
        await userEvent.click(screen.getByRole("button", { name: "Cancelar execução" }));

        expect(listSentWrites(fetchSpy).map((write) => write.url)).toEqual([
            `${NODE_RUN_URL}/cancel`,
        ]);
        expect(screen.queryByRole("button", { name: "Cancelar execução" })).not.toBeInTheDocument();
    });
});

describe("NodeRunDrawer height", () => {
    it("grows with the arrow keys up to 80% of the window", async () => {
        stubFetchRoutes(fakeNodeRunApi());
        renderDrawer(buildSerializedRunView());

        screen.getByRole("separator", { name: "Altura do painel" }).focus();
        for (let press = 0; press < 20; press++) {
            await userEvent.keyboard("{ArrowUp}");
        }

        expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "80");
    });
});

function renderDrawer(view: SerializedRunView): void {
    render(
        <QueryClientProvider client={createTestQueryClient()}>
            <NodeRunDrawer view={view} node={developerNodeOf(view)} onClose={() => undefined} />
        </QueryClientProvider>,
    );
}

function developerNodeOf(view: SerializedRunView): FlowNode {
    const developerNode = view.graph.nodes.find((node) => node.id === DEVELOPER_NODE_ID);
    if (!developerNode) {
        throw new Error("The canonical flow has no developer node");
    }

    return developerNode;
}

function viewWithDeveloperRuns(nodeRuns: Partial<SerializedNodeRun>[]): SerializedRunView {
    return buildSerializedRunView({
        nodeRuns: nodeRuns.map((nodeRun, index) =>
            buildSerializedNodeRun({
                id: `node-run-${index}`,
                nodeId: DEVELOPER_NODE_ID,
                ...nodeRun,
            }),
        ),
    });
}

function developerRun(overrides: Partial<SerializedNodeRun> = {}): SerializedNodeRun {
    return buildSerializedNodeRun({
        id: "node-run-0",
        nodeId: DEVELOPER_NODE_ID,
        workItemId: "1",
        status: "SUCCEEDED",
        ...overrides,
    });
}

function detailOf(nodeRun: SerializedNodeRun): SerializedNodeRunDetail {
    return { nodeRun, artifacts: [] };
}

interface FakeNodeRunApiOptions {
    usage?: UsageRecord[];
    details?: SerializedNodeRunDetail[];
}

function fakeNodeRunApi({ usage = [], details = [] }: FakeNodeRunApiOptions = {}): FakeRoutes {
    const routes: FakeRoutes = { [`GET ${RUN_USAGE_URL}`]: () => Response.json(usage) };
    for (const detail of details) {
        routes[`GET /api/node-runs/${detail.nodeRun.id}`] = () => Response.json(detail);
    }

    return routes;
}

function usageOf(nodeRunId: string, costUsd: number): UsageRecord {
    return {
        id: `usage-${nodeRunId}-${costUsd}`,
        projectId: "project-1",
        runId: "run-1",
        flowId: "flow-1",
        nodeId: DEVELOPER_NODE_ID,
        nodeRunId,
        iteration: 0,
        model: "claude-opus-5-5",
        usage: {
            inputTokens: 1,
            outputTokens: 1,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
        },
        costUsd,
        priceEstimated: false,
        at: "2026-01-01T12:01:00.000Z",
    };
}

function fakeLiveRunApi(nodeRun: SerializedNodeRun): FakeRoutes {
    const answerNoContent = (): Response => new Response(null, { status: HTTP_NO_CONTENT });

    return {
        ...fakeNodeRunApi({ details: [detailOf(nodeRun)] }),
        [`GET ${RUN_URL}`]: () => Response.json(buildSerializedRunView({ nodeRuns: [nodeRun] })),
        [`POST ${NODE_RUN_URL}/retry`]: answerNoContent,
        [`POST ${NODE_RUN_URL}/cancel`]: answerNoContent,
    };
}

function developerAttemptChanges(attempt: number, status: NodeRunStatusName): EventEnvelope {
    return {
        id: 1,
        at: "2026-01-01T12:10:00.000Z",
        event: {
            type: "node_run.updated",
            runId: "run-1",
            projectId: "project-1",
            nodeRunId: `node-run-attempt-${attempt}`,
            nodeId: DEVELOPER_NODE_ID,
            workItemId: "1",
            status,
            attempt,
            iteration: 0,
        },
    };
}

function nodeRunList(): HTMLElement {
    return screen.getByRole("list", { name: "Execuções do nó" });
}

function listedNodeRuns(): string[] {
    return within(nodeRunList())
        .getAllByRole("listitem")
        .map((row) => within(row).getByText(/^item #/).textContent);
}

function nodeRunRow(description: string): HTMLElement {
    const row = within(nodeRunList())
        .getAllByRole("listitem")
        .find((candidate) => within(candidate).queryByText(description));
    if (!row) {
        throw new Error(`No NodeRun row for ${description}`);
    }

    return row;
}

async function selectNodeRun(description: string): Promise<void> {
    await userEvent.click(within(nodeRunRow(description)).getByRole("button"));
}
