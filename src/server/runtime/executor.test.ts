import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { buildIssueSnapshot, ExecutorTestBed, peakOverlapOf } from "@/test/executor_test_bed.js";

const FOUR_ISSUES = [1, 2, 3, 4].map(buildIssueSnapshot);
const DEV_PROMPT = "Implemente a issue";
const DEV_DURATION_MS = 60_000;

describe("executor", () => {
    let bed: ExecutorTestBed;
    let flowId: string;

    beforeEach(async () => {
        bed = new ExecutorTestBed(FOUR_ISSUES);
        flowId = await bed.publishFlow(buildCanonicalFlow());
    });

    afterEach(() => {
        bed.close();
    });

    describe("canonical flow", () => {
        beforeEach(() => {
            bed.runtime.script({
                match: { promptIncludes: DEV_PROMPT },
                durationMs: DEV_DURATION_MS,
            });
        });

        it("runs the 4 items to SUCCEEDED with at most 3 Devs and 1 Reviewer at a time", async () => {
            const started = await bed.startRun(flowId);

            const finished = await bed.runUntilFinished(started.id);

            expect(finished.status).toBe("SUCCEEDED");
            expect(peakOverlapOf(await bed.nodeRunsOf(started.id, "dev"))).toBe(3);
            expect(peakOverlapOf(await bed.nodeRunsOf(started.id, "reviewer"))).toBe(1);
            expect(bed.executor.activeRunIds()).toEqual([]);
        });
    });
});
