import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { JSX } from "react";

import type { SerializedRunView } from "@/shared/run_types.js";
import { buildSerializedRunView } from "@/test/factories/run_view_factory.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { createFakeEventSourceFactory } from "@/test/fakes/fake_event_source.js";
import { listSentWrites, stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import type { FakeRoutes } from "@/test/fakes/fake_fetch.js";
import { createTestQueryClient } from "@/test/render_with_query_client.js";
import { RunControlBar } from "@/web/canvas/live/run_control_bar.js";
import { useLiveRun } from "@/web/canvas/live/use_live_run.js";

const RUN_URL = "/api/runs/run-1";
const RUN_STARTED_AT = "2026-01-01T12:00:00.000Z";
const HTTP_NO_CONTENT = 204;

type ViewedRun = SerializedRunView["run"];

describe("RunControlBar", () => {
    it("names the flow and the version of the run", () => {
        renderBar(buildSerializedRunView());

        expect(bar()).toHaveTextContent("Fábrica básica · v4");
        expect(within(bar()).getByText("Rodando")).toBeInTheDocument();
    });

    it("shows how long the run has been going", () => {
        const clock = new FakeClock(new Date("2026-01-01T12:02:05.000Z"));

        renderBar(buildSerializedRunView(), clock);

        expect(screen.getByLabelText("Duração")).toHaveTextContent("2 min 5 s");
    });

    it("shows when a run paused by the usage limit resumes", () => {
        const resumeAt = new Date(2026, 0, 1, 15, 5).toISOString();

        renderBar(viewOfRun({ status: "PAUSED", pauseReason: "usage_limit", resumeAt }));

        expect(screen.getByRole("status")).toHaveTextContent(
            "Pausada por limite de uso — retoma às 15:05",
        );
    });

    it("offers to raise the budget only when the budget paused the run", () => {
        renderBar(viewOfRun({ status: "PAUSED", pauseReason: "budget" }));

        expect(screen.getByRole("button", { name: "Aumentar orçamento" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Retomar" })).not.toBeInTheDocument();
    });
});

describe("RunControlBar actions", () => {
    it("pauses the run and shows it paused", async () => {
        const fetchSpy = stubFetchRoutes(fakeRunApi());
        renderLiveBar();

        await userEvent.click(await screen.findByRole("button", { name: "Pausar" }));

        expect(await within(bar()).findByText("Pausada")).toBeInTheDocument();
        expect(listSentWrites(fetchSpy).map((write) => write.url)).toEqual([`${RUN_URL}/pause`]);
    });

    it("resumes a run the user paused and shows it running", async () => {
        const fetchSpy = stubFetchRoutes(fakeRunApi({ status: "PAUSED", pauseReason: "user" }));
        renderLiveBar();

        await userEvent.click(await screen.findByRole("button", { name: "Retomar" }));

        expect(await within(bar()).findByText("Rodando")).toBeInTheDocument();
        expect(listSentWrites(fetchSpy).map((write) => write.url)).toEqual([`${RUN_URL}/resume`]);
    });

    it("cancels the run only after the confirmation", async () => {
        const fetchSpy = stubFetchRoutes(fakeRunApi());
        renderLiveBar();

        await userEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
        expect(listSentWrites(fetchSpy)).toEqual([]);
        await userEvent.click(screen.getByRole("button", { name: "Cancelar run" }));

        expect(await within(bar()).findByText("Cancelado")).toBeInTheDocument();
        expect(listSentWrites(fetchSpy).map((write) => write.url)).toEqual([`${RUN_URL}/cancel`]);
    });

    it("sends the new run limit when the budget is raised", async () => {
        const fetchSpy = stubFetchRoutes(fakeRunApi({ status: "PAUSED", pauseReason: "budget" }));
        renderLiveBar();

        await userEvent.click(await screen.findByRole("button", { name: "Aumentar orçamento" }));
        await userEvent.type(screen.getByLabelText("Novo limite da run (US$)"), "5");
        await userEvent.click(screen.getByRole("button", { name: "Salvar limite" }));

        expect(await within(bar()).findByText("Rodando")).toBeInTheDocument();
        expect(listSentWrites(fetchSpy)).toEqual([
            { method: "POST", url: `${RUN_URL}/budget`, body: { run: { maxCostUsd: 5 } } },
        ]);
    });
});

function renderBar(view: SerializedRunView, clock = new FakeClock()): void {
    render(
        <QueryClientProvider client={createTestQueryClient()}>
            <RunControlBar view={view} clock={clock} />
        </QueryClientProvider>,
    );
}

function renderLiveBar(): void {
    const eventSources = createFakeEventSourceFactory();
    function LiveBar(): JSX.Element | null {
        const { view } = useLiveRun("run-1", eventSources.createSource);
        return view ? <RunControlBar view={view} clock={new FakeClock()} /> : null;
    }

    render(
        <QueryClientProvider client={createTestQueryClient()}>
            <LiveBar />
        </QueryClientProvider>,
    );
}

function bar(): HTMLElement {
    return screen.getByRole("region", { name: "Controle da run" });
}

function viewOfRun(changes: Partial<ViewedRun>): SerializedRunView {
    const view = buildSerializedRunView();
    return { ...view, run: { ...view.run, startedAt: RUN_STARTED_AT, ...changes } };
}

// Each action answers like the server does once the run reached the new status.
function fakeRunApi(initialRun: Partial<ViewedRun> = {}): FakeRoutes {
    let run: Partial<ViewedRun> = initialRun;
    const changeRunTo = (changes: Partial<ViewedRun>) => (): Response => {
        run = changes;
        return new Response(null, { status: HTTP_NO_CONTENT });
    };

    return {
        [`GET ${RUN_URL}`]: () => Response.json(viewOfRun(run)),
        [`POST ${RUN_URL}/pause`]: changeRunTo({ status: "PAUSED", pauseReason: "user" }),
        [`POST ${RUN_URL}/resume`]: changeRunTo({ status: "RUNNING" }),
        [`POST ${RUN_URL}/cancel`]: changeRunTo({ status: "CANCELED" }),
        [`POST ${RUN_URL}/budget`]: changeRunTo({ status: "RUNNING" }),
    };
}
