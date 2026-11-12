import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { MockInstance } from "vitest";

import { deriveColumns } from "@/engine/board_columns.js";
import type { BoardCard, BoardView } from "@/shared/board_types.js";
import type { FlowSummary } from "@/shared/flow_types.js";
import type { ListedTrigger, TriggerFire } from "@/shared/trigger_types.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { buildWorkItem } from "@/test/factories/work_item_factory.js";
import { listSentWrites, stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import { createTestQueryClient } from "@/test/render_with_query_client.js";
import { ProjectBoard } from "@/web/board/board_view.js";
import { ToastProvider } from "@/web/components/ui/toast.js";

const PROJECT_ID = "prj_forja";
const BOARD_URL = `/api/projects/${PROJECT_ID}/board`;
const TRIGGERS_URL = `/api/projects/${PROJECT_ID}/triggers?kind=board_column`;
const FLOWS_URL = `/api/projects/${PROJECT_ID}/flows`;
const FIRE_URL = "/api/triggers/trg_specify/fire";
const COLUMN_URL = "/api/work-items/itm_42/column";

const COLUMN_WIDTH_PX = 300;
const COLUMN_GAP_PX = 12;
const COLUMN_HEIGHT_PX = 600;

const ITEM = buildWorkItem({ id: "itm_42", number: 42, title: "Tela de login" });
const BLOCKER = buildWorkItem({ id: "itm_12", number: 12, title: "Modelo de usuário" });

const SPECIFY_TRIGGER: ListedTrigger = {
    id: "trg_specify",
    projectId: PROJECT_ID,
    flowId: "flw_basic",
    name: "Ao soltar em Especificar",
    enabled: true,
    policy: "skip",
    itemSelection: "event_items",
    config: { kind: "board_column", columnId: "stage:specify" },
    createdAt: "2026-11-10T12:00:00.000Z",
};

const BASIC_FLOW: FlowSummary = {
    id: "flw_basic",
    projectId: PROJECT_ID,
    name: "Fábrica básica",
    isDefault: true,
    archived: false,
    latestVersion: 1,
    draftUpdatedAt: "2026-11-10T12:00:00.000Z",
    draftRevision: 1,
};

const STARTED_FIRE: TriggerFire = {
    id: "fire_1",
    triggerId: SPECIFY_TRIGGER.id,
    at: "2026-11-12T12:00:00.000Z",
    outcome: "started",
    runId: "run_1",
};

function buildBoard(cards: BoardCard[]): BoardView {
    return { flowId: "flw_basic", columns: deriveColumns(buildCanonicalFlow()), cards };
}

const BACKLOG_BOARD = buildBoard([{ item: ITEM, columnId: "backlog" }]);

// jsdom does not lay out, so each column gets the rect a browser would give it, side by side.
function layOutColumnsSideBySide(): void {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
        this: Element,
    ) {
        const column = this.closest("[data-board-column]");
        if (!column) {
            return new DOMRect();
        }
        const columnIndex = [...document.querySelectorAll("[data-board-column]")].indexOf(column);
        const left = columnIndex * (COLUMN_WIDTH_PX + COLUMN_GAP_PX);
        return new DOMRect(left, 0, COLUMN_WIDTH_PX, COLUMN_HEIGHT_PX);
    });
}

function stubBoardApi(board: BoardView = BACKLOG_BOARD): MockInstance<typeof fetch> {
    return stubFetchRoutes({
        [`GET ${BOARD_URL}`]: () => Response.json(board),
        [`GET ${TRIGGERS_URL}`]: () => Response.json([SPECIFY_TRIGGER]),
        [`GET ${FLOWS_URL}`]: () => Response.json([BASIC_FLOW]),
        [`POST ${FIRE_URL}`]: () => Response.json(STARTED_FIRE, { status: 201 }),
        [`POST ${COLUMN_URL}`]: () => Response.json({ ...ITEM, manualColumn: "done" }),
    });
}

function renderBoard(): void {
    render(
        <QueryClientProvider client={createTestQueryClient()}>
            <ToastProvider>
                <MemoryRouter>
                    <ProjectBoard projectId={PROJECT_ID} />
                </MemoryRouter>
            </ToastProvider>
        </QueryClientProvider>,
    );
}

async function dragByKeyboard(
    user: UserEvent,
    { title, columnsToTheRight }: { title: string; columnsToTheRight: number },
): Promise<void> {
    const handle = await screen.findByRole("button", { name: `Mover ${title}` });
    handle.focus();
    await user.keyboard("[Space]");
    for (let step = 0; step < columnsToTheRight; step++) {
        await user.keyboard("[ArrowRight]");
    }
    await user.keyboard("[Space]");
}

describe("board drag and drop", () => {
    beforeEach(() => {
        layOutColumnsSideBySide();
    });

    it("saves the manual column when a card is dropped on Concluído by keyboard", async () => {
        const fetchSpy = stubBoardApi();
        const user = userEvent.setup();
        renderBoard();

        await dragByKeyboard(user, { title: ITEM.title, columnsToTheRight: 6 });

        await waitFor(() =>
            expect(listSentWrites(fetchSpy)).toEqual([
                { method: "POST", url: COLUMN_URL, body: { column: "done" } },
            ]),
        );
    });

    it("refuses a stage without a trigger and says why", async () => {
        const fetchSpy = stubBoardApi();
        const user = userEvent.setup();
        renderBoard();

        await dragByKeyboard(user, { title: ITEM.title, columnsToTheRight: 3 });

        expect(await screen.findByText("Esta etapa é movida pela execução")).toBeInTheDocument();
        expect(listSentWrites(fetchSpy)).toEqual([]);
    });

    it("asks for confirmation and starts the run when the card is dropped on the trigger column", async () => {
        const fetchSpy = stubBoardApi();
        const user = userEvent.setup();
        renderBoard();

        await dragByKeyboard(user, { title: ITEM.title, columnsToTheRight: 2 });
        const confirmation = await screen.findByRole("dialog", {
            name: "Iniciar 'Fábrica básica' para #42?",
        });
        await user.click(within(confirmation).getByRole("button", { name: "Iniciar run" }));

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(listSentWrites(fetchSpy)).toEqual([
            { method: "POST", url: FIRE_URL, body: { itemIds: [ITEM.id] } },
        ]);
    });

    it("does not start the run when the confirmation is cancelled", async () => {
        const fetchSpy = stubBoardApi();
        const user = userEvent.setup();
        renderBoard();

        await dragByKeyboard(user, { title: ITEM.title, columnsToTheRight: 2 });
        const confirmation = await screen.findByRole("dialog");
        await user.click(within(confirmation).getByRole("button", { name: "Cancelar" }));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(listSentWrites(fetchSpy)).toEqual([]);
    });

    it("refuses to start a run for a blocked item, naming its blocker", async () => {
        const blockedItem = { ...ITEM, blockedBy: [BLOCKER.id] };
        const fetchSpy = stubBoardApi(
            buildBoard([
                { item: blockedItem, columnId: "blocked" },
                { item: BLOCKER, columnId: "backlog" },
            ]),
        );
        const user = userEvent.setup();
        renderBoard();

        await dragByKeyboard(user, { title: ITEM.title, columnsToTheRight: 1 });

        expect(await screen.findByText("Item bloqueado por #12")).toBeInTheDocument();
        expect(listSentWrites(fetchSpy)).toEqual([]);
    });

    it("marks the trigger column with an icon in its header", async () => {
        stubBoardApi();

        renderBoard();

        const specifyColumn = await screen.findByRole("region", { name: "Especificar" });
        expect(
            await within(specifyColumn).findByRole("img", { name: "Coluna-gatilho" }),
        ).toBeInTheDocument();
        expect(
            within(screen.getByRole("region", { name: "Desenvolver" })).queryByRole("img"),
        ).not.toBeInTheDocument();
    });

    it("dims the columns that refuse the dragged card while it is picked up", async () => {
        stubBoardApi();
        const user = userEvent.setup();
        renderBoard();
        await screen.findByRole("img", { name: "Coluna-gatilho" });

        screen.getByRole("button", { name: `Mover ${ITEM.title}` }).focus();
        await user.keyboard("[Space]");

        expect(screen.getByRole("region", { name: "Desenvolver" })).toHaveClass("opacity-40");
        expect(screen.getByRole("region", { name: "Especificar" })).toHaveClass("border-accent");
        await user.keyboard("[Escape]");
        expect(screen.getByRole("region", { name: "Desenvolver" })).not.toHaveClass("opacity-40");
    });
});
