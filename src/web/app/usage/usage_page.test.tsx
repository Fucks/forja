import { screen, within } from "@testing-library/react";
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
});

async function findChartBars(): Promise<(string | null)[]> {
    const chart = await screen.findByRole("list", { name: "Tokens por dia" });

    return within(chart)
        .getAllByRole("listitem")
        .map((bar) => bar.getAttribute("aria-label"));
}
