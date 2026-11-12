import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

import type { BoardCard, ItemTimeline, ItemTimelineEntry } from "@/shared/board_types.js";
import type { WorkItem } from "@/shared/work_item_types.js";
import { buildWorkItem } from "@/test/factories/work_item_factory.js";
import { listSentWrites, respondWithApiError, stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import { createTestQueryClient } from "@/test/render_with_query_client.js";
import { WorkItemDrawer } from "@/web/board/work_item_drawer.js";
import { ToastProvider } from "@/web/components/ui/toast.js";

const PROJECT_ID = "prj_forja";
const ITEM_ID = "itm_42";
const TIMELINE_URL = `/api/work-items/${ITEM_ID}/timeline`;
const COLUMN_URL = `/api/work-items/${ITEM_ID}/column`;
const ISSUE_URL = "https://github.com/Fucks/forja/issues/42";
const PR_URL = "https://github.com/Fucks/forja/pull/12";
const HTTP_SERVER_ERROR = 500;

const ITEM = buildWorkItem({
    id: ITEM_ID,
    number: 42,
    url: ISSUE_URL,
    title: "Tela de login",
    body: "Criar a tela de login.\nCom e-mail e senha.",
    blockedBy: ["itm_41"],
});
const BLOCKER = buildWorkItem({ id: "itm_41", number: 41, title: "Modelo de usuário" });

function buildEntry(overrides: Partial<ItemTimelineEntry> = {}): ItemTimelineEntry {
    return {
        runId: "run_1",
        flowName: "Sandcastle",
        nodeRunId: "nr_dev",
        nodeLabel: "Dev",
        status: "SUCCEEDED",
        iteration: 2,
        attempt: 1,
        startedAt: "2026-11-10T12:00:00.000Z",
        finishedAt: "2026-11-10T12:05:00.000Z",
        costUsd: 1.5,
        ...overrides,
    };
}

const TIMELINE: ItemTimeline = {
    entries: [
        buildEntry(),
        buildEntry({ nodeRunId: "nr_tl", nodeLabel: "TL", iteration: 0, costUsd: 0.25 }),
    ],
    totalCostUsd: 1.75,
    prUrl: PR_URL,
    spec: "Usar o formulário padrão.",
};

function renderDrawer(card: Partial<BoardCard> = {}, blockers: WorkItem[] = [BLOCKER]): void {
    render(
        <QueryClientProvider client={createTestQueryClient()}>
            <ToastProvider>
                <MemoryRouter>
                    <WorkItemDrawer
                        projectId={PROJECT_ID}
                        card={{ item: ITEM, columnId: "stage:develop", runId: "run_1", ...card }}
                        blockers={blockers}
                        onClose={() => undefined}
                    />
                </MemoryRouter>
            </ToastProvider>
        </QueryClientProvider>,
    );
}

function drawer(): HTMLElement {
    return screen.getByRole("dialog", { name: "Tela de login" });
}

describe("WorkItemDrawer", () => {
    it("shows the number, the state, the description and the blockers of the item", () => {
        stubFetchRoutes({ [`GET ${TIMELINE_URL}`]: () => Response.json(TIMELINE) });

        renderDrawer();

        expect(within(drawer()).getByRole("link", { name: "#42" })).toHaveAttribute(
            "href",
            ISSUE_URL,
        );
        expect(within(drawer()).getByText("Aberta")).toBeInTheDocument();
        expect(within(drawer()).getByText(/Com e-mail e senha/)).toBeInTheDocument();
        const blockers = within(drawer()).getByRole("list", { name: "Bloqueado por" });
        expect(blockers).toHaveTextContent("#41 Modelo de usuário");
    });

    it("lists the NodeRuns of the timeline with their step, duration and cost", async () => {
        stubFetchRoutes({ [`GET ${TIMELINE_URL}`]: () => Response.json(TIMELINE) });

        renderDrawer();

        const timeline = await within(drawer()).findByRole("list", { name: "Linha do tempo" });
        const entries = within(timeline).getAllByRole("listitem");
        expect(entries).toHaveLength(2);
        expect(entries[0]).toHaveTextContent("Dev");
        expect(entries[0]).toHaveTextContent("iteração 2 · tentativa 1");
        expect(entries[0]).toHaveTextContent("5 min");
        expect(entries[0]).toHaveTextContent("US$ 1,50");
        expect(entries[1]).toHaveTextContent("TL");
    });

    it("shows the total cost, the pull request and the spec of the item", async () => {
        stubFetchRoutes({ [`GET ${TIMELINE_URL}`]: () => Response.json(TIMELINE) });

        renderDrawer();

        expect(await within(drawer()).findByText("US$ 1,75")).toBeInTheDocument();
        expect(within(drawer()).getByRole("link", { name: "Pull request" })).toHaveAttribute(
            "href",
            PR_URL,
        );
        expect(within(drawer()).getByText("Especificação do TL")).toBeInTheDocument();
        expect(within(drawer()).getByText("Usar o formulário padrão.")).toBeInTheDocument();
    });

    it("links each entry to its run with the NodeRun selected and to its logs", async () => {
        stubFetchRoutes({ [`GET ${TIMELINE_URL}`]: () => Response.json(TIMELINE) });

        renderDrawer();

        const entry = await within(drawer()).findByRole("link", {
            name: "Dev · iteração 2 · tentativa 1",
        });
        expect(entry).toHaveAttribute("href", `/projects/${PROJECT_ID}/runs/run_1?nodeRun=nr_dev`);
        expect(within(drawer()).getByRole("link", { name: "Logs de Dev" })).toHaveAttribute(
            "href",
            "/api/node-runs/nr_dev/logs/raw",
        );
    });

    it("opens the latest run of the item", () => {
        stubFetchRoutes({ [`GET ${TIMELINE_URL}`]: () => Response.json(TIMELINE) });

        renderDrawer();

        expect(within(drawer()).getByRole("link", { name: "Abrir run" })).toHaveAttribute(
            "href",
            `/projects/${PROJECT_ID}/runs/run_1`,
        );
    });

    it("says when the timeline could not be loaded", async () => {
        stubFetchRoutes({
            [`GET ${TIMELINE_URL}`]: () => respondWithApiError(HTTP_SERVER_ERROR, "Falhou."),
        });

        renderDrawer();

        expect(await within(drawer()).findByRole("alert")).toHaveTextContent(
            "Não foi possível carregar a linha do tempo.",
        );
    });

    it("moves the item to Precisa de humano", async () => {
        const user = userEvent.setup();
        const fetchSpy = stubFetchRoutes({
            [`GET ${TIMELINE_URL}`]: () => Response.json(TIMELINE),
            [`POST ${COLUMN_URL}`]: () => Response.json({ ...ITEM, manualColumn: "needs_human" }),
        });
        renderDrawer();

        await user.click(
            within(drawer()).getByRole("button", { name: "Mover para Precisa de humano" }),
        );

        expect(listSentWrites(fetchSpy)).toEqual([
            { method: "POST", url: COLUMN_URL, body: { column: "needs_human" } },
        ]);
    });

    it("offers no move to the column the item is already in", () => {
        stubFetchRoutes({ [`GET ${TIMELINE_URL}`]: () => Response.json(TIMELINE) });

        renderDrawer({ columnId: "done" });

        expect(
            within(drawer()).queryByRole("button", { name: "Mover para Concluído" }),
        ).not.toBeInTheDocument();
        expect(
            within(drawer()).getByRole("button", { name: "Mover para Precisa de humano" }),
        ).toBeInTheDocument();
    });
});
