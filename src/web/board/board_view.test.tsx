import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import { deriveColumns } from "@/engine/board_columns.js";
import type { BoardCard, BoardView } from "@/shared/board_types.js";
import type { EventEnvelope } from "@/shared/events.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { buildWorkItem } from "@/test/factories/work_item_factory.js";
import { createFakeEventSourceFactory } from "@/test/fakes/fake_event_source.js";
import type { FakeEventSourceFactory } from "@/test/fakes/fake_event_source.js";
import { listSentWrites, stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import { createTestQueryClient } from "@/test/render_with_query_client.js";
import { ProjectBoard } from "@/web/board/board_view.js";
import { ToastProvider } from "@/web/components/ui/toast.js";

const PROJECT_ID = "prj_forja";
const BOARD_URL = `/api/projects/${PROJECT_ID}/board`;
const SYNC_URL = `/api/projects/${PROJECT_ID}/work-items/sync`;
const PR_URL = "https://github.com/Fucks/forja/pull/12";

const ITEM = buildWorkItem({ id: "itm_42", number: 42, title: "Tela de login" });
const COLUMNS = deriveColumns(buildCanonicalFlow());
const EMPTY_GRAPH: FlowGraph = { schemaVersion: 1, nodes: [], edges: [], groups: [] };

const NODE_RUN_UPDATED: EventEnvelope = {
    id: 1,
    at: "2026-11-10T12:00:00.000Z",
    event: {
        type: "node_run.updated",
        runId: "run_1",
        projectId: PROJECT_ID,
        nodeRunId: "nr_dev",
        nodeId: "dev",
        workItemId: ITEM.id,
        status: "RUNNING",
        attempt: 1,
        iteration: 0,
    },
};

function buildBoard(cards: Omit<BoardCard, "item">[]): BoardView {
    return {
        flowId: "flw_sandcastle",
        columns: COLUMNS,
        cards: cards.map((card) => ({ item: ITEM, ...card })),
    };
}

function columnNamed(name: string): HTMLElement {
    return screen.getByRole("region", { name });
}

describe("ProjectBoard", () => {
    let eventSources: FakeEventSourceFactory;

    beforeEach(() => {
        eventSources = createFakeEventSourceFactory();
    });

    function renderBoard(): void {
        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <ToastProvider>
                    <ProjectBoard
                        projectId={PROJECT_ID}
                        createEventSource={eventSources.createSource}
                    />
                </ToastProvider>
            </QueryClientProvider>,
        );
    }

    it("shows the columns of the flow with how many cards each one has", async () => {
        stubFetchRoutes({
            [`GET ${BOARD_URL}`]: () => Response.json(buildBoard([{ columnId: "backlog" }])),
        });

        renderBoard();

        await screen.findByRole("article", { name: "Tela de login" });
        const headers = screen
            .getAllByRole("heading", { level: 2 })
            .map((heading) => heading.textContent);
        expect(headers).toEqual([
            "Backlog",
            "Bloqueado",
            "Especificar",
            "Desenvolver",
            "Revisar e abrir PR",
            "Precisa de humano",
            "Concluído",
        ]);
        expect(within(columnNamed("Backlog")).getByText("1")).toBeInTheDocument();
        expect(within(columnNamed("Desenvolver")).getByText("0")).toBeInTheDocument();
    });

    it("shows the number, the current step, the cost and the pull request of a card", async () => {
        const runningCard: Omit<BoardCard, "item"> = {
            columnId: "stage:develop",
            status: "RUNNING",
            currentNodeLabel: "Dev",
            costUsd: 1.25,
            prUrl: PR_URL,
        };
        stubFetchRoutes({ [`GET ${BOARD_URL}`]: () => Response.json(buildBoard([runningCard])) });

        renderBoard();

        const card = await within(await waitForColumn("Desenvolver")).findByRole("article", {
            name: "Tela de login",
        });
        expect(within(card).getByText("#42")).toBeInTheDocument();
        expect(within(card).getByText("Dev ·")).toBeInTheDocument();
        expect(within(card).getByText("Rodando")).toBeInTheDocument();
        expect(within(card).getByText("US$ 1,25")).toBeInTheDocument();
        expect(within(card).getByRole("link", { name: "Pull request" })).toHaveAttribute(
            "href",
            PR_URL,
        );
    });

    it("moves the card when the engine reports a node run, without reloading the page", async () => {
        let board = buildBoard([{ columnId: "backlog" }]);
        stubFetchRoutes({ [`GET ${BOARD_URL}`]: () => Response.json(board) });
        renderBoard();
        await within(await waitForColumn("Backlog")).findByRole("article");

        board = buildBoard([
            { columnId: "stage:develop", status: "RUNNING", currentNodeLabel: "Dev" },
        ]);
        act(() => eventSources.latestSource().emit(NODE_RUN_UPDATED));

        const card = await within(columnNamed("Desenvolver")).findByRole("article");
        expect(within(card).getByText("Rodando")).toBeInTheDocument();
        expect(within(columnNamed("Backlog")).queryByRole("article")).not.toBeInTheDocument();
    });

    it("follows only the events of its project", async () => {
        stubFetchRoutes({
            [`GET ${BOARD_URL}`]: () => Response.json(buildBoard([{ columnId: "backlog" }])),
        });

        renderBoard();
        await screen.findByRole("article");

        expect(eventSources.latestSource().url).toBe(`/api/events?projectId=${PROJECT_ID}`);
    });

    it("syncs with GitHub and shows the synced items", async () => {
        const user = userEvent.setup();
        let board = buildBoard([]);
        const fetchSpy = stubFetchRoutes({
            [`GET ${BOARD_URL}`]: () => Response.json(board),
            [`POST ${SYNC_URL}`]: () => {
                board = buildBoard([{ columnId: "backlog" }]);
                return Response.json({ created: 1, updated: 0 });
            },
        });
        renderBoard();

        await user.click(await screen.findByRole("button", { name: "Sincronizar" }));

        expect(await screen.findByRole("article", { name: "Tela de login" })).toBeInTheDocument();
        expect(listSentWrites(fetchSpy).map((write) => write.url)).toEqual([SYNC_URL]);
    });

    it("asks to publish a default flow when the project has none", async () => {
        const boardWithoutFlow: BoardView = { columns: deriveColumns(EMPTY_GRAPH), cards: [] };
        stubFetchRoutes({ [`GET ${BOARD_URL}`]: () => Response.json(boardWithoutFlow) });

        renderBoard();

        expect(await screen.findByRole("status")).toHaveTextContent("Publique um fluxo padrão");
    });
});

async function waitForColumn(name: string): Promise<HTMLElement> {
    await waitFor(() => columnNamed(name));
    return columnNamed(name);
}
