import { takeSnapshot } from "@/engine/scheduler_snapshot.js";
import { isSchedulerSnapshotOfRun } from "@/server/runtime/stored_snapshot.js";
import { buildNodeRunState } from "@/test/factories/node_run_state_factory.js";
import { buildRunState } from "@/test/factories/run_state_factory.js";

const RUN_ID = "run-1";

describe("isSchedulerSnapshotOfRun", () => {
    const storedSnapshot: unknown = JSON.parse(
        JSON.stringify(
            takeSnapshot({
                run: buildRunState({ id: RUN_ID, status: "RUNNING" }),
                nodeRuns: [buildNodeRunState({ runId: RUN_ID, status: "RUNNING" })],
            }),
        ),
    );

    it("accepts the snapshot the scheduler saved for the run", () => {
        expect(isSchedulerSnapshotOfRun(storedSnapshot, RUN_ID)).toBe(true);
    });

    it("rejects the snapshot of another run", () => {
        expect(isSchedulerSnapshotOfRun(storedSnapshot, "run-2")).toBe(false);
    });

    it.each<[string, unknown]>([
        ["nothing", undefined],
        ["text", "estado"],
        ["an object without NodeRuns", { run: { id: RUN_ID, status: "RUNNING" } }],
        [
            "a NodeRun with an unknown status",
            {
                run: { id: RUN_ID, status: "RUNNING", createdAt: "2026-01-01T12:00:00.000Z" },
                nodeRuns: [{ ...buildNodeRunState({ runId: RUN_ID }), status: "LOST" }],
            },
        ],
    ])("rejects %s", (_description, stored) => {
        expect(isSchedulerSnapshotOfRun(stored, RUN_ID)).toBe(false);
    });
});
