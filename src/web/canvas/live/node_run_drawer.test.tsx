import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

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
import { stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import type { FakeRoutes } from "@/test/fakes/fake_fetch.js";
import { createTestQueryClient } from "@/test/render_with_query_client.js";
import { NodeRunDrawer } from "@/web/canvas/live/node_run_drawer.js";

const DEVELOPER_NODE_ID = "dev";
const RUN_USAGE_URL = "/api/runs/run-1/usage";
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
