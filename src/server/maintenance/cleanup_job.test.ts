import { createCleanupJob, type CleanupJob } from "@/server/maintenance/cleanup_job.js";
import type { CleanupReport } from "@/server/maintenance/cleanup_service.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";

const TIMEZONE = "America/Sao_Paulo";
const BEFORE_THREE_AM_IN_SAO_PAULO = new Date("2026-11-13T05:00:00Z");
const THREE_AM_IN_SAO_PAULO = new Date("2026-11-13T06:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const BYTES_PER_MB = 1024 * 1024;
const REPORT: CleanupReport = {
    deletedRuns: 2,
    freedBytes: 3 * BYTES_PER_MB,
    prunedWorktrees: 1,
};

function settle(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
}

describe("createCleanupJob", () => {
    let clock: FakeClock;
    let cleanupTimes: string[];
    let logs: string[];
    let isCleanupFailing: boolean;
    let job: CleanupJob;

    beforeEach(() => {
        clock = new FakeClock(BEFORE_THREE_AM_IN_SAO_PAULO);
        cleanupTimes = [];
        logs = [];
        isCleanupFailing = false;
        job = createCleanupJob({
            clock,
            timezone: TIMEZONE,
            cleanup: () => {
                cleanupTimes.push(clock.now().toISOString());
                if (isCleanupFailing) {
                    return Promise.reject(new Error("disco somente leitura"));
                }
                return Promise.resolve(REPORT);
            },
            log: (message) => logs.push(message),
        });
    });

    afterEach(() => {
        job.stop();
    });

    async function advanceTo(date: Date): Promise<void> {
        clock.set(date);
        await settle();
    }

    it("cleans up at 03:00 in the local timezone", async () => {
        job.start();

        await advanceTo(new Date(THREE_AM_IN_SAO_PAULO.getTime() - 1));
        expect(cleanupTimes).toEqual([]);

        await advanceTo(THREE_AM_IN_SAO_PAULO);
        expect(cleanupTimes).toEqual([THREE_AM_IN_SAO_PAULO.toISOString()]);
    });

    it("cleans up again every day", async () => {
        job.start();

        await advanceTo(THREE_AM_IN_SAO_PAULO);
        await advanceTo(new Date(THREE_AM_IN_SAO_PAULO.getTime() + DAY_MS));

        expect(cleanupTimes).toHaveLength(2);
    });

    it("logs how much space the cleanup freed", async () => {
        await job.runNow();

        expect(logs).toEqual([
            "[forja] limpeza: logs de 2 runs removidos (3 MB liberados), 1 worktree órfão removido",
        ]);
    });

    it("logs a failed scheduled cleanup and still schedules the next one", async () => {
        isCleanupFailing = true;
        job.start();

        await advanceTo(THREE_AM_IN_SAO_PAULO);
        isCleanupFailing = false;
        await advanceTo(new Date(THREE_AM_IN_SAO_PAULO.getTime() + DAY_MS));

        expect(logs[0]).toBe("[forja] limpeza falhou: disco somente leitura");
        expect(cleanupTimes).toHaveLength(2);
    });

    it("shares the cleanup in progress instead of starting a second one", async () => {
        const first = job.runNow();
        const second = job.runNow();

        expect(await first).toEqual(REPORT);
        expect(await second).toEqual(REPORT);
        expect(cleanupTimes).toHaveLength(1);
    });

    it("stops cleaning up once stopped", async () => {
        job.start();
        job.stop();

        await advanceTo(THREE_AM_IN_SAO_PAULO);

        expect(cleanupTimes).toEqual([]);
    });
});
