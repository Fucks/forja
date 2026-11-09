import type { SyncResult } from "@/server/work_items/github_sync.js";
import { createSyncScheduler } from "@/server/work_items/sync_scheduler.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";

const INTERVAL_MS = 5 * 60_000;
const PROJECT_IDS = ["prj_forja", "prj_loja"];

describe("createSyncScheduler", () => {
    let clock: FakeClock;
    let syncedProjectIds: string[];
    let resultOfSync: (projectId: string) => SyncResult;

    beforeEach(() => {
        clock = new FakeClock();
        syncedProjectIds = [];
        resultOfSync = () => ({ created: 0, updated: 0, closed: 0, at: clock.now().toISOString() });
    });

    function startScheduler(): { stop(): void } {
        const scheduler = createSyncScheduler({
            clock,
            intervalMs: INTERVAL_MS,
            listProjectIds: () => Promise.resolve(PROJECT_IDS),
            sync: (projectId) => {
                syncedProjectIds.push(projectId);
                return Promise.resolve(resultOfSync(projectId));
            },
        });
        scheduler.start();
        return scheduler;
    }

    async function advanceOneInterval(): Promise<void> {
        clock.advance(INTERVAL_MS);
        await settlePendingSyncs();
    }

    function settlePendingSyncs(): Promise<void> {
        return new Promise((resolve) => setImmediate(resolve));
    }

    it("waits one interval before the first sync", () => {
        startScheduler();

        clock.advance(INTERVAL_MS - 1);

        expect(syncedProjectIds).toEqual([]);
    });

    it("syncs every project once per interval", async () => {
        startScheduler();

        await advanceOneInterval();
        await advanceOneInterval();

        expect(syncedProjectIds).toEqual([...PROJECT_IDS, ...PROJECT_IDS]);
    });

    it("keeps syncing after a sync reports an error", async () => {
        resultOfSync = (projectId) => ({
            created: 0,
            updated: 0,
            closed: 0,
            at: clock.now().toISOString(),
            error: `gh falhou em ${projectId}`,
        });
        startScheduler();

        await advanceOneInterval();
        await advanceOneInterval();

        expect(syncedProjectIds).toHaveLength(PROJECT_IDS.length * 2);
    });

    it("stops syncing once stopped", async () => {
        const scheduler = startScheduler();
        await advanceOneInterval();

        scheduler.stop();
        await advanceOneInterval();

        expect(syncedProjectIds).toEqual(PROJECT_IDS);
    });
});
