import { planCleanup, type LogDirInfo } from "@/server/maintenance/plan_cleanup.js";

const NOW = new Date("2026-11-13T03:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 30;
const NO_CEILING = Number.MAX_SAFE_INTEGER;

function finishedDaysAgo(runId: string, days: number, bytes = 100): LogDirInfo {
    return { runId, finishedAt: new Date(NOW.getTime() - days * DAY_MS), bytes, active: false };
}

function activeRun(runId: string, bytes = 100): LogDirInfo {
    return { runId, bytes, active: true };
}

describe("planCleanup", () => {
    it("deletes the logs of runs finished more than the retention days ago", () => {
        const dirs = [finishedDaysAgo("run_velha", 31), finishedDaysAgo("run_recente", 29)];

        const plan = planCleanup(
            dirs,
            { retentionDays: RETENTION_DAYS, maxTotalBytes: NO_CEILING },
            NOW,
        );

        expect(plan).toEqual({ deleteRunIds: ["run_velha"], freedBytes: 100 });
    });

    it("never deletes the logs of an active run", () => {
        const dirs = [activeRun("run_ativa", 5_000)];

        const plan = planCleanup(dirs, { retentionDays: RETENTION_DAYS, maxTotalBytes: 10 }, NOW);

        expect(plan).toEqual({ deleteRunIds: [], freedBytes: 0 });
    });

    it("treats logs whose run is gone from the database as expired", () => {
        const dirs: LogDirInfo[] = [{ runId: "run_apagada", bytes: 40, active: false }];

        const plan = planCleanup(
            dirs,
            { retentionDays: RETENTION_DAYS, maxTotalBytes: NO_CEILING },
            NOW,
        );

        expect(plan).toEqual({ deleteRunIds: ["run_apagada"], freedBytes: 40 });
    });

    it("deletes the oldest finished runs until the total fits the ceiling", () => {
        const dirs = [
            finishedDaysAgo("run_3_dias", 3, 300),
            finishedDaysAgo("run_10_dias", 10, 300),
            finishedDaysAgo("run_1_dia", 1, 300),
            finishedDaysAgo("run_5_dias", 5, 300),
        ];

        const plan = planCleanup(dirs, { retentionDays: RETENTION_DAYS, maxTotalBytes: 650 }, NOW);

        expect(plan).toEqual({ deleteRunIds: ["run_10_dias", "run_5_dias"], freedBytes: 600 });
    });

    it("counts the expired runs before deleting more to fit the ceiling", () => {
        const dirs = [finishedDaysAgo("run_vencida", 40, 500), finishedDaysAgo("run_nova", 2, 500)];

        const plan = planCleanup(dirs, { retentionDays: RETENTION_DAYS, maxTotalBytes: 600 }, NOW);

        expect(plan).toEqual({ deleteRunIds: ["run_vencida"], freedBytes: 500 });
    });

    it("counts active runs in the total but deletes only finished ones to fit the ceiling", () => {
        const dirs = [activeRun("run_ativa", 800), finishedDaysAgo("run_ontem", 1, 300)];

        const plan = planCleanup(dirs, { retentionDays: RETENTION_DAYS, maxTotalBytes: 900 }, NOW);

        expect(plan).toEqual({ deleteRunIds: ["run_ontem"], freedBytes: 300 });
    });
});
