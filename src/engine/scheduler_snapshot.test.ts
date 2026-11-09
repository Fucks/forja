import { takeSnapshot, wakeupTimesOf } from "@/engine/scheduler_snapshot.js";
import { buildNodeRunState } from "@/test/factories/node_run_state_factory.js";
import { buildRunState } from "@/test/factories/run_state_factory.js";

const RETRY_AT = new Date("2026-01-01T13:00:30Z");
const RESUME_AT = new Date("2026-01-01T15:05:00Z");

describe("wakeupTimesOf", () => {
    it("wakes up when each queued NodeRun is due", () => {
        const snapshot = takeSnapshot({
            run: buildRunState({ status: "RUNNING" }),
            nodeRuns: [
                buildNodeRunState({ id: "retry", status: "QUEUED", queuedAt: RETRY_AT }),
                buildNodeRunState({ id: "pending", status: "PENDING" }),
                buildNodeRunState({ id: "done", status: "SUCCEEDED", queuedAt: RESUME_AT }),
            ],
        });

        expect(wakeupTimesOf(snapshot)).toEqual([RETRY_AT]);
    });

    it("wakes up when the usage limit of a paused run resets", () => {
        const snapshot = takeSnapshot({
            run: buildRunState({
                status: "PAUSED",
                pauseReason: "usage_limit",
                resumeAt: RESUME_AT,
            }),
            nodeRuns: [],
        });

        expect(wakeupTimesOf(snapshot)).toEqual([RESUME_AT]);
    });

    it("does not wake up a run paused by the user", () => {
        const snapshot = takeSnapshot({
            run: buildRunState({ status: "PAUSED", pauseReason: "user" }),
            nodeRuns: [],
        });

        expect(wakeupTimesOf(snapshot)).toEqual([]);
    });
});
