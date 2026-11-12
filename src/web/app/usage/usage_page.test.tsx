import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import { DEFAULT_PROJECT_SETTINGS } from "@/shared/settings_types.js";
import type { ProjectSettings } from "@/shared/settings_types.js";
import type { UsageAggregate, UsageGroupBy } from "@/shared/usage_types.js";
import { buildUsageAggregate } from "@/test/factories/usage_record_factory.js";
import { stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import type { FakeRoutes } from "@/test/fakes/fake_fetch.js";
import { renderAppAt } from "@/test/render_app_at.js";

const USAGE_PAGE_PATH = "/projects/prj_forja/usage";
const NOON_IN_SAO_PAULO = new Date("2026-11-12T15:00:00.000Z");

const LAST_SEVEN_DAYS = { from: "2026-11-06T03:00:00.000Z", to: "2026-11-13T03:00:00.000Z" };
const TODAY = { from: "2026-11-12T03:00:00.000Z", to: "2026-11-13T03:00:00.000Z" };

interface Period {
    from: string;
    to: string;
}

const PROJECT_SETTINGS: ProjectSettings = {
    ...DEFAULT_PROJECT_SETTINGS,
    timezone: "America/Sao_Paulo",
    dailyBudgetUsd: null,
};

function usageRoute(
    period: Period,
    groupBy: UsageGroupBy,
    filters: Record<string, string> = {},
): string {
    const query = new URLSearchParams({ ...period, groupBy, ...filters });

    return `GET /api/projects/prj_forja/usage?${query.toString()}`;
}

function stubUsageApi({
    settings = PROJECT_SETTINGS,
    routes = {},
}: { settings?: ProjectSettings; routes?: FakeRoutes } = {}): void {
    stubFetchRoutes({
        "GET /api/projects/prj_forja/settings": () => Response.json(settings),
        [usageRoute(LAST_SEVEN_DAYS, "day")]: () => Response.json([]),
        [usageRoute(TODAY, "day")]: () => Response.json([]),
        ...routes,
    });
}

function answer(rows: UsageAggregate[]): () => Response {
    return () => Response.json(rows);
}

async function chooseGrouping(option: string): Promise<void> {
    const user = userEvent.setup();
    await user.click(await screen.findByRole("combobox", { name: "Agrupar por" }));
    await user.click(await screen.findByRole("option", { name: option }));
}

async function findTableRows(tableName: string): Promise<string[][]> {
    const table = await screen.findByRole("table", { name: tableName });
    const [, ...bodyRows] = await within(table).findAllByRole("row");

    return bodyRows.map((row) =>
        within(row)
            .getAllByRole("cell")
            .map((cell) => cell.textContent),
    );
}

describe("UsagePage", () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(NOON_IN_SAO_PAULO);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("shows the cost of each node in the period when grouped by node", async () => {
        stubUsageApi({
            routes: {
                [usageRoute(LAST_SEVEN_DAYS, "node")]: answer([
                    buildUsageAggregate({
                        key: "dev",
                        inputTokens: 12_000,
                        outputTokens: 3_000,
                        cacheReadTokens: 50_000,
                        costUsd: 1.25,
                        nodeRuns: 4,
                    }),
                    buildUsageAggregate({ key: "reviewer", costUsd: 0.5, nodeRuns: 2 }),
                ]),
            },
        });
        renderAppAt(USAGE_PAGE_PATH);

        await chooseGrouping("Nó");

        expect(await findTableRows("Uso por nó")).toEqual([
            ["dev", "12 mil", "3 mil", "50 mil", "US$ 1,25", "4"],
            ["reviewer", "1 mil", "200", "0", "US$ 0,50", "2"],
            ["Total", "13 mil", "3,2 mil", "50 mil", "US$ 1,75", "6"],
        ]);
    });

    it("shows one bar per day of the last 7 days, including the days without usage", async () => {
        stubUsageApi({
            routes: {
                [usageRoute(LAST_SEVEN_DAYS, "day")]: answer([
                    buildUsageAggregate({
                        key: "2026-11-08",
                        inputTokens: 2_000,
                        outputTokens: 500,
                        costUsd: 0.3,
                    }),
                    buildUsageAggregate({
                        key: "2026-11-12",
                        inputTokens: 1_000,
                        outputTokens: 100,
                        costUsd: 0.12,
                    }),
                ]),
            },
        });

        renderAppAt(USAGE_PAGE_PATH);

        expect(await findChartBars()).toEqual([
            "06/11: 0 de entrada, 0 de saída, US$ 0,00",
            "07/11: 0 de entrada, 0 de saída, US$ 0,00",
            "08/11: 2 mil de entrada, 500 de saída, US$ 0,30",
            "09/11: 0 de entrada, 0 de saída, US$ 0,00",
            "10/11: 0 de entrada, 0 de saída, US$ 0,00",
            "11/11: 0 de entrada, 0 de saída, US$ 0,00",
            "12/11: 1 mil de entrada, 100 de saída, US$ 0,12",
        ]);
    });

    it("filters the page by the node whose row is clicked", async () => {
        const reviewerRow = buildUsageAggregate({ key: "reviewer", costUsd: 0.5 });
        stubUsageApi({
            routes: {
                [usageRoute(LAST_SEVEN_DAYS, "node")]: answer([
                    buildUsageAggregate({ key: "dev", costUsd: 1.25 }),
                    reviewerRow,
                ]),
                [usageRoute(LAST_SEVEN_DAYS, "node", { nodeId: "reviewer" })]: answer([
                    reviewerRow,
                ]),
                [usageRoute(LAST_SEVEN_DAYS, "day", { nodeId: "reviewer" })]: answer([
                    buildUsageAggregate({ key: "2026-11-12", costUsd: 0.5 }),
                ]),
            },
        });
        renderAppAt(USAGE_PAGE_PATH);
        await chooseGrouping("Nó");

        await userEvent.click(await screen.findByRole("button", { name: "reviewer" }));

        expect(await screen.findByText("Filtrando pelo nó reviewer")).toBeInTheDocument();
        expect(await findTableRows("Uso por nó")).toEqual([
            ["reviewer", "1 mil", "200", "0", "US$ 0,50", "1"],
            ["Total", "1 mil", "200", "0", "US$ 0,50", "1"],
        ]);
        expect((await findChartBars()).at(-1)).toBe(
            "12/11: 1 mil de entrada, 200 de saída, US$ 0,50",
        );
    });

    it("clears the node filter", async () => {
        stubUsageApi({
            routes: {
                [usageRoute(LAST_SEVEN_DAYS, "node")]: answer([
                    buildUsageAggregate({ key: "dev" }),
                ]),
                [usageRoute(LAST_SEVEN_DAYS, "node", { nodeId: "dev" })]: answer([
                    buildUsageAggregate({ key: "dev" }),
                ]),
            },
        });
        renderAppAt(USAGE_PAGE_PATH);
        await chooseGrouping("Nó");
        await userEvent.click(await screen.findByRole("button", { name: "dev" }));

        await userEvent.click(await screen.findByRole("button", { name: "Limpar filtro" }));

        expect(screen.queryByText("Filtrando pelo nó dev")).not.toBeInTheDocument();
    });

    it("shows only today when the period is today", async () => {
        stubUsageApi();
        renderAppAt(USAGE_PAGE_PATH);

        await userEvent.click(await screen.findByRole("radio", { name: "Hoje" }));

        expect(await findChartBars()).toEqual(["12/11: 0 de entrada, 0 de saída, US$ 0,00"]);
    });

    it("shows the days of a custom period", async () => {
        const firstDaysOfNovember = {
            from: "2026-11-01T03:00:00.000Z",
            to: "2026-11-04T03:00:00.000Z",
        };
        stubUsageApi({
            routes: {
                [usageRoute(firstDaysOfNovember, "day")]: answer([
                    buildUsageAggregate({ key: "2026-11-02", costUsd: 0.2 }),
                ]),
            },
        });
        renderAppAt(USAGE_PAGE_PATH);
        await userEvent.click(await screen.findByRole("radio", { name: "Personalizado" }));

        fireEvent.change(screen.getByLabelText("De"), { target: { value: "2026-11-01" } });
        fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2026-11-03" } });

        await waitFor(async () =>
            expect(await findChartBars()).toEqual([
                "01/11: 0 de entrada, 0 de saída, US$ 0,00",
                "02/11: 1 mil de entrada, 200 de saída, US$ 0,20",
                "03/11: 0 de entrada, 0 de saída, US$ 0,00",
            ]),
        );
    });

    describe("the today card", () => {
        it("compares the spending of today with the daily budget", async () => {
            stubUsageApi({
                settings: { ...PROJECT_SETTINGS, dailyBudgetUsd: 10 },
                routes: {
                    [usageRoute(TODAY, "day")]: answer([
                        buildUsageAggregate({ key: "2026-11-12", costUsd: 3.5 }),
                    ]),
                },
            });

            renderAppAt(USAGE_PAGE_PATH);

            const card = await screen.findByRole("region", { name: "Hoje" });
            expect(await within(card).findByText("US$ 3,50")).toBeInTheDocument();
            expect(within(card).getByText("de US$ 10,00")).toBeInTheDocument();
            expect(
                within(card).getByRole("progressbar", { name: "Orçamento diário" }),
            ).toHaveAttribute("aria-valuenow", "35");
            expect(within(card).queryByText(/Acima de 80%/)).not.toBeInTheDocument();
        });

        it("warns when the spending of today passes 80% of the daily budget", async () => {
            stubUsageApi({
                settings: { ...PROJECT_SETTINGS, dailyBudgetUsd: 10 },
                routes: {
                    [usageRoute(TODAY, "day")]: answer([
                        buildUsageAggregate({ key: "2026-11-12", costUsd: 8.5 }),
                    ]),
                },
            });

            renderAppAt(USAGE_PAGE_PATH);

            const card = await screen.findByRole("region", { name: "Hoje" });
            expect(await within(card).findByText("Acima de 80% do orçamento")).toBeInTheDocument();
            expect(within(card).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "85");
        });

        it("shows the spending of today without a comparison when there is no daily budget", async () => {
            stubUsageApi({
                routes: {
                    [usageRoute(TODAY, "day")]: answer([
                        buildUsageAggregate({ key: "2026-11-12", costUsd: 3.5 }),
                    ]),
                },
            });

            renderAppAt(USAGE_PAGE_PATH);

            const card = await screen.findByRole("region", { name: "Hoje" });
            expect(await within(card).findByText("US$ 3,50")).toBeInTheDocument();
            expect(within(card).getByText("Sem orçamento diário configurado.")).toBeInTheDocument();
            expect(within(card).queryByRole("progressbar")).not.toBeInTheDocument();
        });
    });
});

async function findChartBars(): Promise<(string | null)[]> {
    const chart = await screen.findByRole("list", { name: "Tokens por dia" });

    return within(chart)
        .getAllByRole("listitem")
        .map((bar) => bar.getAttribute("aria-label"));
}
