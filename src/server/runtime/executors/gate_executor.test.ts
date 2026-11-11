import {
    createGateExecutor,
    MAX_APPROVAL_DIFF_BYTES,
} from "@/server/runtime/executors/gate_executor.js";
import type { NodeExecutionContext } from "@/server/runtime/node_executors.js";
import type { Approval, NewApproval } from "@/shared/approval_types.js";
import type { GateConfig } from "@/shared/node_configs/gate_config.js";
import { createNodeOfType } from "@/test/factories/flow_graph_factory.js";
import { buildNodeExecutionContext } from "@/test/factories/node_execution_context_factory.js";
import { buildNodeRunState } from "@/test/factories/node_run_state_factory.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { buildRunRecord } from "@/test/factories/run_record_factory.js";
import { FakeAgentRuntime } from "@/test/fakes/fake_agent_runtime.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { buildIssueSnapshot } from "@/test/executor_test_bed.js";

const NOW = new Date("2026-11-10T10:00:00Z");
const ISSUE = buildIssueSnapshot(7);
const BRANCH_DIFF = "diff --git a/src/a.ts b/src/a.ts\n+export const a = 1;\n";
const REVIEW_MESSAGE = "Revise o diff antes do push";

interface GateBed {
    runtime: FakeAgentRuntime;
    createdApprovals: NewApproval[];
    context: NodeExecutionContext;
    execute: ReturnType<typeof createGateExecutor>;
}

describe("gate executor", () => {
    it("asks for an approval with the gate's message and sections, then waits for it", async () => {
        const bed = createGateBed({ message: REVIEW_MESSAGE, show: ["diff", "artifacts"] });

        const outcome = await bed.execute(bed.context);

        expect(bed.createdApprovals).toEqual([
            {
                projectId: "prj_forja",
                runId: "run_entrega",
                nodeRunId: "nrn_gate",
                workItemId: ISSUE.id,
                message: REVIEW_MESSAGE,
                show: ["diff", "artifacts"],
                diff: BRANCH_DIFF,
                expiresAt: undefined,
            },
        ]);
        expect(outcome).toEqual({ waiting: "approval", approvalId: "apv_1" });
    });

    it("diffs the item's branch against the project's base branch", async () => {
        const bed = createGateBed({ show: ["diff"] });

        await bed.execute(bed.context);

        expect(bed.runtime.diffBaseBranches).toEqual(["develop"]);
    });

    it("keeps at most 200 KB of the diff", async () => {
        const bed = createGateBed({ show: ["diff"] });
        bed.runtime.scriptDiff("+".repeat(MAX_APPROVAL_DIFF_BYTES + 10));

        await bed.execute(bed.context);

        expect(bed.createdApprovals[0]?.diff).toHaveLength(MAX_APPROVAL_DIFF_BYTES);
    });

    it("does not open the workspace when the gate does not show the diff", async () => {
        const bed = createGateBed({ show: ["logs"] });

        await bed.execute(bed.context);

        expect(bed.createdApprovals[0]?.diff).toBeUndefined();
        expect(bed.runtime.calls).toEqual([]);
    });

    it("asks without a diff when the gate has no item", async () => {
        const bed = createGateBed({ show: ["diff"] }, { item: undefined });

        await bed.execute(bed.context);

        expect(bed.createdApprovals[0]?.diff).toBeUndefined();
    });

    it("sets the approval to expire after the gate's timeout", async () => {
        const bed = createGateBed({ timeoutHours: 2 });
        const expiresAt = new Date("2026-11-10T12:00:00Z");

        const outcome = await bed.execute(bed.context);

        expect(bed.createdApprovals[0]?.expiresAt).toBe(expiresAt.toISOString());
        expect(outcome).toEqual({ waiting: "approval", approvalId: "apv_1", expiresAt });
    });
});

function createGateBed(
    config: Partial<GateConfig>,
    overrides: Partial<NodeExecutionContext> = { item: ISSUE },
): GateBed {
    const clock = new FakeClock(NOW);
    const runtime = new FakeAgentRuntime({ clock }).scriptDiff(BRANCH_DIFF);
    const gateNode = createNodeOfType("gate", "gate", { x: 0, y: 0 });
    const node = { ...gateNode, config: { ...gateNode.config, ...config } };
    const run = buildRunRecord({ id: "run_entrega", projectId: "prj_forja" });
    const context = buildNodeExecutionContext(node, {
        run,
        nodeRun: buildNodeRunState({
            id: "nrn_gate",
            runId: run.id,
            nodeId: node.id,
            workItemId: overrides.item?.id,
            status: "RUNNING",
        }),
        project: buildProject({ baseBranch: "develop" }),
        runtime,
        clock,
        ...overrides,
    });
    const createdApprovals: NewApproval[] = [];
    const approvals = {
        create: (input: NewApproval): Promise<Approval> => {
            createdApprovals.push(input);
            const id = `apv_${createdApprovals.length}`;
            return Promise.resolve({
                ...input,
                id,
                status: "pending",
                createdAt: NOW.toISOString(),
            });
        },
    };

    return { runtime, createdApprovals, context, execute: createGateExecutor({ approvals }) };
}
