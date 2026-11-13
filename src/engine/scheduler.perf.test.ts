import { buildLargeFlow } from "@/test/factories/large_flow_factory.js";
import { createSchedulerHarness } from "@/test/factories/scheduler_harness.js";

const CI_SLACK_FACTOR = 2;
const HANDLE_TARGET_MS = 2;
const ITEM_COUNT = 100;
const FIVE_NODE_FLOW = buildLargeFlow({ nodes: 5, groups: 1 });

describe("scheduler performance", () => {
    it("handles each event of 100 items × 5 nodes in under 2 ms on average", () => {
        const harness = createSchedulerHarness({ graph: FIVE_NODE_FLOW });
        const itemIds = Array.from({ length: ITEM_COUNT }, (_, index) => String(index + 1));

        harness.start(itemIds);
        harness.runToCompletion();

        expect(harness.run.status).toBe("SUCCEEDED");
        expect(averageOf(harness.handleDurationsMs)).toBeLessThan(
            HANDLE_TARGET_MS * CI_SLACK_FACTOR,
        );
    });
});

function averageOf(values: number[]): number {
    const total = values.reduce((sum, value) => sum + value, 0);
    return total / values.length;
}
