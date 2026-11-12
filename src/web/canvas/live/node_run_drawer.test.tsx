import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { JSX } from "react";
import { MemoryRouter } from "react-router";

import type { EventEnvelope, NodeRunStatusName } from "@/shared/events.js";
import type { FlowNode } from "@/shared/flow_graph.js";
import type { LogPage, StoredLogEvent } from "@/shared/log_types.js";
import type {
    SerializedNodeRun,
    SerializedNodeRunDetail,
    SerializedRunView,
} from "@/shared/run_types.js";
import type { TokenUsage, UsageRecord } from "@/shared/usage_types.js";
import { buildApprovalFlow } from "@/test/factories/flow_graph_factory.js";
import {
    buildSerializedNodeRun,
    buildSerializedRunView,
} from "@/test/factories/run_view_factory.js";
import { buildStoredLogEvent } from "@/test/factories/stored_log_event_factory.js";
import { stubElementSizes } from "@/test/fakes/fake_element_size.js";
import { createFakeEventSourceFactory, FakeEventSource } from "@/test/fakes/fake_event_source.js";
import type { FakeEventSourceFactory } from "@/test/fakes/fake_event_source.js";
import { listSentWrites, stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import type { FakeRoutes } from "@/test/fakes/fake_fetch.js";
import { createTestQueryClient } from "@/test/render_with_query_client.js";
import { NodeRunDrawer } from "@/web/canvas/live/node_run_drawer.js";
import { useLiveRun } from "@/web/canvas/live/use_live_run.js";

const DEVELOPER_NODE_ID = "dev";
const GATE_NODE_ID = "gate";
const RUN_URL = "/api/runs/run-1";
const RUN_USAGE_URL = `${RUN_URL}/usage`;
const NODE_RUN_URL = "/api/node-runs/node-run-0";
const HTTP_NO_CONTENT = 204;
const LONG_TEXT_LENGTH = 500;
const LOG_VIEWPORT_HEIGHT_PX = 400;
const LOG_ROW_HEIGHT_PX = 20;

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
    it("links a gate NodeRun to its approval", async () => {
        const gateRun = buildSerializedNodeRun({
            id: "node-run-gate",
            nodeId: GATE_NODE_ID,
            workItemId: "1",
            status: "WAITING_APPROVAL",
        });
        stubFetchRoutes(fakeNodeRunApi({ details: [detailOf(gateRun)] }));
        const view = buildSerializedRunView({ graph: buildApprovalFlow(), nodeRuns: [gateRun] });
        renderGateDrawer(view);

        await selectNodeRun("item #1 · tentativa 1");

        expect(screen.getByRole("link", { name: "Abrir aprovação" })).toHaveAttribute(
            "href",
            "/projects/project-1/approvals?nodeRun=node-run-gate",
        );
    });

    it("offers no approval link outside a gate", async () => {
        const nodeRun = developerRun();
        stubFetchRoutes(fakeNodeRunApi({ details: [detailOf(nodeRun)] }));
        renderDrawer(buildSerializedRunView({ nodeRuns: [nodeRun] }));

        await selectNodeRun("item #1 · tentativa 1");

        expect(screen.queryByRole("link", { name: "Abrir aprovação" })).not.toBeInTheDocument();
    });

    it("shows the tokens, the model and the cost of the selected NodeRun", async () => {
        const nodeRun = developerRun();
        stubFetchRoutes(
            fakeNodeRunApi({
                details: [detailOf(nodeRun)],
                usage: [
                    usageOf("node-run-0", 0.1, { inputTokens: 1_500, cacheReadInputTokens: 900 }),
                    usageOf("node-run-0", 0.25, { outputTokens: 2_000 }),
                    usageOf("node-run-other", 3),
                ],
            }),
        );
        renderDrawer(buildSerializedRunView({ nodeRuns: [nodeRun] }));

        await selectNodeRun("item #1 · tentativa 1");

        expect(await findUsageOfDetail()).toEqual([
            ["Modelo", "claude-opus-5-5"],
            ["Tokens de entrada", "1,5 mil"],
            ["Tokens de saída", "2 mil"],
            ["Cache lido", "900"],
            ["Cache gravado", "0"],
            ["Custo", "US$ 0,35"],
        ]);
    });

    it("marks the cost as approximate when the price of the model was estimated", async () => {
        const nodeRun = developerRun();
        const estimatedUsage = { ...usageOf("node-run-0", 0.4), priceEstimated: true };
        stubFetchRoutes(fakeNodeRunApi({ details: [detailOf(nodeRun)], usage: [estimatedUsage] }));
        renderDrawer(buildSerializedRunView({ nodeRuns: [nodeRun] }));

        await selectNodeRun("item #1 · tentativa 1");

        expect(await findUsageOfDetail()).toContainEqual(["Custo", "≈ US$ 0,40"]);
    });

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

describe("NodeRunDrawer logs", () => {
    const READ_CALL = buildStoredLogEvent({
        seq: 2,
        kind: "tool_call",
        name: "Read",
        args: '{"file_path":"src/app.tsx"}',
    });
    const NPM_WARNING = buildStoredLogEvent({ seq: 3, kind: "raw", line: "npm WARN deprecated" });
    const STORED_EVENTS = [
        buildStoredLogEvent({ seq: 1, kind: "system", message: "Container iniciado" }),
        READ_CALL,
        NPM_WARNING,
        buildStoredLogEvent({ seq: 4, kind: "text", text: "Pronto." }),
    ];

    let eventSources: FakeEventSourceFactory;

    beforeEach(() => {
        stubElementSizes({
            viewportHeightPx: LOG_VIEWPORT_HEIGHT_PX,
            rowHeightPx: LOG_ROW_HEIGHT_PX,
        });
        eventSources = createFakeEventSourceFactory();
        vi.stubGlobal("EventSource", function OpenFakeEventSource(url: string) {
            return eventSources.createSource(url);
        });
    });

    afterEach(() => {
        vi.stubGlobal("EventSource", FakeEventSource);
    });

    async function openLogsOf(nodeRun: SerializedNodeRun, storedEvents: StoredLogEvent[]) {
        const fetchSpy = stubFetchRoutes({
            ...fakeNodeRunApi({ details: [detailOf(nodeRun)] }),
            [`GET ${NODE_RUN_URL}/logs?fromSeq=1&limit=2000`]: () =>
                Response.json(logPageOf(storedEvents)),
            [`GET ${NODE_RUN_URL}/logs?fromSeq=5&limit=2000`]: () =>
                Response.json(logPageOf(storedEvents.slice(4))),
        });
        renderDrawer(buildSerializedRunView({ nodeRuns: [nodeRun] }));
        await selectNodeRun("item #1 · tentativa 1");
        await userEvent.click(await screen.findByRole("tab", { name: "Logs" }));
        await screen.findByRole("log");

        return fetchSpy;
    }

    function shownLogLines(container: HTMLElement = screen.getByRole("log")): string[] {
        return within(container)
            .getAllByRole("listitem")
            .map((row) => row.textContent);
    }

    it("shows every event of a finished NodeRun in order", async () => {
        await openLogsOf(developerRun(), STORED_EVENTS);

        expect(shownLogLines()).toEqual([
            "+00:00Container iniciado",
            "+00:01▸ Read",
            "+00:03Pronto.",
        ]);
    });

    it("shows the new events of a running NodeRun without reloading", async () => {
        const storedEvents = STORED_EVENTS.slice(0, 4);
        await openLogsOf(developerRun({ status: "RUNNING" }), storedEvents);

        storedEvents.push(buildStoredLogEvent({ seq: 5, kind: "text", text: "Testes passando." }));
        act(() => eventSources.latestSource().emit(logAppendedTo("node-run-0", 5)));

        expect(await screen.findByText("Testes passando.")).toBeInTheDocument();
    });

    it("shows a tool call collapsed and its arguments when expanded", async () => {
        await openLogsOf(developerRun(), STORED_EVENTS);
        const toolCall = screen.getByRole("button", { name: "Read" });
        expect(toolCall).toHaveAttribute("aria-expanded", "false");

        await userEvent.click(toolCall);

        expect(screen.getByText(/"file_path": "src\/app.tsx"/)).toBeInTheDocument();
    });

    it("shows the raw lines only with the raw filter", async () => {
        await openLogsOf(developerRun(), STORED_EVENTS);
        expect(screen.queryByText("npm WARN deprecated")).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole("radio", { name: "Bruto" }));

        expect(screen.getByText("npm WARN deprecated")).toBeInTheDocument();
    });

    it("downloads the raw NDJSON of the NodeRun", async () => {
        const clickedLinks: HTMLAnchorElement[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
            this: HTMLAnchorElement,
        ) {
            clickedLinks.push(this);
        });
        await openLogsOf(developerRun(), STORED_EVENTS);

        await userEvent.click(screen.getByRole("button", { name: "Baixar log bruto" }));

        expect(clickedLinks.map((link) => new URL(link.href).pathname)).toEqual([
            `${NODE_RUN_URL}/logs/raw`,
        ]);
        expect(clickedLinks[0]).toHaveAttribute("download");
    });

    it("opens the logs in full screen", async () => {
        await openLogsOf(developerRun(), STORED_EVENTS);

        await userEvent.click(screen.getByRole("button", { name: "Tela cheia" }));

        const dialog = await screen.findByRole("dialog", { name: "Logs" });
        expect(shownLogLines(within(dialog).getByRole("log"))).toHaveLength(3);
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

function renderGateDrawer(view: SerializedRunView): void {
    const gateNode = view.graph.nodes.find((node) => node.id === GATE_NODE_ID);
    if (!gateNode) {
        throw new Error("The approval flow has no gate node");
    }

    render(
        <MemoryRouter>
            <QueryClientProvider client={createTestQueryClient()}>
                <NodeRunDrawer view={view} node={gateNode} onClose={() => undefined} />
            </QueryClientProvider>
        </MemoryRouter>,
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

function logPageOf(events: StoredLogEvent[]): LogPage {
    const lastSeq = events.at(-1)?.seq ?? 0;
    return { events, nextSeq: lastSeq + 1, total: lastSeq };
}

function logAppendedTo(nodeRunId: string, seq: number): EventEnvelope {
    return {
        id: seq,
        at: "2026-01-01T12:10:00.000Z",
        event: {
            type: "log.appended",
            runId: "run-1",
            projectId: "project-1",
            nodeRunId,
            fromSeq: seq,
            toSeq: seq,
        },
    };
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

async function findUsageOfDetail(): Promise<[string | null, string | null][]> {
    const usage = await screen.findByRole("region", { name: "Uso" });
    const terms = within(usage).getAllByRole("term");
    const definitions = within(usage).getAllByRole("definition");

    return terms.map((term, index) => [term.textContent, definitions[index]?.textContent ?? null]);
}

function usageOf(
    nodeRunId: string,
    costUsd: number,
    tokens: Partial<TokenUsage> = {},
): UsageRecord {
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
            ...tokens,
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
