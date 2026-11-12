import { act, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { MockInstance } from "vitest";

import { formatDateTime, formatDuration, formatUsd } from "@/lib/format.js";
import type { FlowSummary } from "@/shared/flow_types.js";
import type { RunListItem } from "@/shared/run_types.js";
import { buildRunStartedEvent } from "@/test/factories/forja_event_factory.js";
import { buildRunListItem } from "@/test/factories/run_list_item_factory.js";
import { captureBrowserEventSources } from "@/test/fakes/fake_event_source.js";
import { listSentWrites, respondWithApiError, stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import type { FakeRoutes } from "@/test/fakes/fake_fetch.js";
import { renderAppAt } from "@/test/render_app_at.js";

const RUNS_PAGE_PATH = "/projects/prj_forja/runs";
const RUNS_API = "/api/projects/prj_forja/runs";
const RUNS_PAGE_SIZE = 50;
const FIRST_PAGE_URL = `${RUNS_API}?limit=${RUNS_PAGE_SIZE}`;

const DELIVERY_FLOW: FlowSummary = {
    id: "flw_entrega",
    projectId: "prj_forja",
    name: "Entrega",
    isDefault: true,
    archived: false,
    latestVersion: 2,
    draftUpdatedAt: "2026-11-01T10:00:00.000Z",
    draftRevision: 3,
};

const FAILED_RUN = buildRunListItem({
    id: "run_noturna",
    status: "FAILED",
    itemCount: 3,
    failedItemCount: 1,
    createdAt: "2026-11-11T23:00:00.000Z",
    startedAt: "2026-11-11T23:00:01.000Z",
    durationMs: 125_000,
    costUsd: 1.5,
    triggerName: "Noturno",
});

const RUNNING_RUN = buildRunListItem({
    id: "run_ativa",
    status: "RUNNING",
    createdAt: "2026-11-11T22:00:00.000Z",
    finishedAt: undefined,
    durationMs: undefined,
    costUsd: 0.2,
});

const DRAFT_ONLY_FLOW: FlowSummary = {
    ...DELIVERY_FLOW,
    id: "flw_rascunho",
    name: "Rascunho",
    isDefault: false,
    latestVersion: undefined,
};

const HTTP_CREATED = 201;
const HTTP_UNPROCESSABLE_ENTITY = 422;

const RUN_FINISHED_ENVELOPE = {
    id: 1,
    at: "2026-11-12T00:00:00.000Z",
    event: buildRunStartedEvent({
        type: "run.finished",
        runId: RUNNING_RUN.id,
        projectId: "prj_forja",
        status: "SUCCEEDED",
    }),
};

function stubRunsApi(routes: FakeRoutes = {}): MockInstance<typeof fetch> {
    return stubFetchRoutes({
        "GET /api/projects/prj_forja/flows": () => Response.json([DELIVERY_FLOW]),
        [`GET ${FIRST_PAGE_URL}`]: () => Response.json([FAILED_RUN, RUNNING_RUN]),
        ...routes,
    });
}

async function chooseFilter(label: string, option: string): Promise<void> {
    const user = userEvent.setup();
    await user.click(await screen.findByRole("combobox", { name: label }));
    await user.click(await screen.findByRole("option", { name: option }));
}

async function openNewRunDialog(): Promise<HTMLElement> {
    await userEvent.setup().click(await screen.findByRole("button", { name: "Nova run" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova run" });
    await waitFor(() =>
        expect(within(dialog).getByRole("combobox", { name: "Fluxo" })).toHaveTextContent(
            "Entrega",
        ),
    );

    return dialog;
}

async function findRunRows(): Promise<HTMLElement[]> {
    const table = await screen.findByRole("table", { name: "Runs" });
    const [, ...bodyRows] = await within(table).findAllByRole("row");

    return bodyRows;
}

describe("RunsPage", () => {
    it("lists the runs with state, flow, items, start, duration, cost and trigger", async () => {
        stubRunsApi();

        renderAppAt(RUNS_PAGE_PATH);

        const failedRow = await screen.findByRole("row", { name: /Noturno/ });
        expect(within(failedRow).getByText("Falha")).toBeInTheDocument();
        expect(within(failedRow).getByText("Entrega · v2")).toBeInTheDocument();
        expect(within(failedRow).getByText("2 ok · 1 com falha")).toBeInTheDocument();
        expect(
            within(failedRow).getByText(formatDateTime(new Date("2026-11-11T23:00:01.000Z"))),
        ).toBeInTheDocument();
        expect(within(failedRow).getByText(formatDuration(125_000))).toBeInTheDocument();
        expect(within(failedRow).getByText(formatUsd(1.5))).toBeInTheDocument();
    });

    it("shows the active runs on top, with a manual trigger when none started them", async () => {
        stubRunsApi();

        renderAppAt(RUNS_PAGE_PATH);

        const [firstRow, secondRow] = await findRunRows();
        expect(firstRow).toHaveTextContent("Rodando");
        expect(firstRow).toHaveTextContent("Manual");
        expect(secondRow).toHaveTextContent("Falha");
    });

    it("opens the run when its row is clicked", async () => {
        stubRunsApi();
        const router = renderAppAt(RUNS_PAGE_PATH);

        await userEvent.setup().click(await screen.findByRole("row", { name: /Noturno/ }));

        await waitFor(() =>
            expect(router.state.location.pathname).toBe(`${RUNS_PAGE_PATH}/${FAILED_RUN.id}`),
        );
    });

    it("shows only the failed runs when filtering by the Falha state", async () => {
        stubRunsApi({
            [`GET ${FIRST_PAGE_URL}&status=FAILED`]: () => Response.json([FAILED_RUN]),
        });
        renderAppAt(RUNS_PAGE_PATH);
        await findRunRows();

        await chooseFilter("Estado", "Falha");

        await waitFor(async () => expect(await findRunRows()).toHaveLength(1));
        const [onlyRow] = await findRunRows();
        expect(onlyRow).toHaveTextContent("Falha");
    });

    it("asks for the active states together when filtering by Ativas", async () => {
        const activeUrl = `${FIRST_PAGE_URL}&status=QUEUED&status=RUNNING&status=PAUSED`;
        stubRunsApi({ [`GET ${activeUrl}`]: () => Response.json([RUNNING_RUN]) });
        renderAppAt(RUNS_PAGE_PATH);
        await findRunRows();

        await chooseFilter("Estado", "Ativas");

        await waitFor(async () => expect(await findRunRows()).toHaveLength(1));
    });

    it("shows only the runs of the chosen flow", async () => {
        stubRunsApi({
            [`GET ${FIRST_PAGE_URL}&flowId=flw_entrega`]: () => Response.json([RUNNING_RUN]),
        });
        renderAppAt(RUNS_PAGE_PATH);
        await findRunRows();

        await chooseFilter("Fluxo", "Entrega");

        await waitFor(async () => expect(await findRunRows()).toHaveLength(1));
    });

    it("loads the older runs through the cursor of the last run", async () => {
        const fullPage = Array.from({ length: RUNS_PAGE_SIZE }, (_, index) =>
            buildRunListItem({ id: `run_${index}` }),
        );
        const lastRunOfPage = fullPage.at(-1)?.id ?? "";
        const olderRun = buildRunListItem({ id: "run_antiga", triggerName: "Antigo" });
        stubRunsApi({
            [`GET ${FIRST_PAGE_URL}`]: () => Response.json(fullPage),
            [`GET ${FIRST_PAGE_URL}&before=${lastRunOfPage}`]: () => Response.json([olderRun]),
        });
        renderAppAt(RUNS_PAGE_PATH);

        await userEvent.setup().click(await screen.findByRole("button", { name: "Carregar mais" }));

        expect(await screen.findByRole("row", { name: /Antigo/ })).toBeInTheDocument();
        expect(await findRunRows()).toHaveLength(RUNS_PAGE_SIZE + 1);
        expect(screen.queryByRole("button", { name: "Carregar mais" })).not.toBeInTheDocument();
    });

    it("reloads the list when a run of the project changes, without reloading the page", async () => {
        const eventSources = captureBrowserEventSources();
        let listedRuns: RunListItem[] = [RUNNING_RUN];
        stubRunsApi({ [`GET ${FIRST_PAGE_URL}`]: () => Response.json(listedRuns) });
        renderAppAt(RUNS_PAGE_PATH);
        const [runningRow] = await findRunRows();
        expect(runningRow).toHaveTextContent("Rodando");

        listedRuns = [{ ...RUNNING_RUN, status: "SUCCEEDED" }];
        act(() => eventSources.latestSource().emit(RUN_FINISHED_ENVELOPE));

        await waitFor(async () => {
            const [finishedRow] = await findRunRows();
            expect(finishedRow).toHaveTextContent("Sucesso");
        });
    });

    describe("Nova run", () => {
        it("starts a run of the chosen flow with the typed items and opens it", async () => {
            const fetchSpy = stubRunsApi({
                [`POST ${RUNS_API}`]: () =>
                    Response.json(buildRunListItem({ id: "run_nova" }), { status: HTTP_CREATED }),
            });
            const router = renderAppAt(RUNS_PAGE_PATH);
            const dialog = await openNewRunDialog();
            const user = userEvent.setup();

            await user.type(within(dialog).getByLabelText("Itens"), "issue-1, issue-2 issue-3");
            await user.click(within(dialog).getByRole("button", { name: "Executar" }));

            await waitFor(() =>
                expect(router.state.location.pathname).toBe(`${RUNS_PAGE_PATH}/run_nova`),
            );
            expect(listSentWrites(fetchSpy)).toEqual([
                {
                    method: "POST",
                    url: RUNS_API,
                    body: { flowId: DELIVERY_FLOW.id, itemIds: ["issue-1", "issue-2", "issue-3"] },
                },
            ]);
        });

        it("offers only the published flows", async () => {
            stubRunsApi({
                "GET /api/projects/prj_forja/flows": () =>
                    Response.json([DELIVERY_FLOW, DRAFT_ONLY_FLOW]),
            });
            renderAppAt(RUNS_PAGE_PATH);
            const dialog = await openNewRunDialog();

            await userEvent.setup().click(within(dialog).getByRole("combobox", { name: "Fluxo" }));

            expect(screen.getByRole("option", { name: "Entrega" })).toBeInTheDocument();
            expect(screen.queryByRole("option", { name: "Rascunho" })).not.toBeInTheDocument();
        });

        it("shows why the run could not start", async () => {
            stubRunsApi({
                [`POST ${RUNS_API}`]: () =>
                    respondWithApiError(HTTP_UNPROCESSABLE_ENTITY, "Publique o fluxo antes."),
            });
            renderAppAt(RUNS_PAGE_PATH);
            const dialog = await openNewRunDialog();

            await userEvent.setup().click(within(dialog).getByRole("button", { name: "Executar" }));

            expect(await within(dialog).findByRole("alert")).toHaveTextContent(
                "Publique o fluxo antes.",
            );
        });
    });

    it("explains when there are no runs yet", async () => {
        stubRunsApi({ [`GET ${FIRST_PAGE_URL}`]: () => Response.json([]) });

        renderAppAt(RUNS_PAGE_PATH);

        expect(await screen.findByText("Nenhuma run ainda")).toBeInTheDocument();
    });
});
