import { executeTriggerNode } from "@/server/runtime/executors/trigger_executor.js";
import { buildIssueSnapshot } from "@/test/executor_test_bed.js";
import { createNodeOfType } from "@/test/factories/flow_graph_factory.js";
import { buildNodeExecutionContext } from "@/test/factories/node_execution_context_factory.js";

const POSITION = { x: 0, y: 0 };
const ISSUE_1 = buildIssueSnapshot(1);
const ISSUE_2 = buildIssueSnapshot(2);

describe("deterministic executors", () => {
    describe("trigger", () => {
        it("outputs the item snapshots of the run", async () => {
            const trigger = createNodeOfType("trigger", "trigger", POSITION);
            const context = buildNodeExecutionContext(trigger, { runItems: [ISSUE_1, ISSUE_2] });

            const result = await executeTriggerNode(context);

            expect(result.outputs).toEqual({ items: [ISSUE_1, ISSUE_2] });
        });
    });
});
