import type { FastifyInstance } from "fastify";

import { buildApp } from "@/server/app.js";
import type { RunRecord } from "@/server/runs/run_repository.js";
import { recoverRuns } from "@/server/runtime/recovery.js";
import type { Approval } from "@/shared/approval_types.js";
import type { GateConfig } from "@/shared/node_configs/gate_config.js";
import { buildApprovalFlow } from "@/test/factories/flow_graph_factory.js";
import { buildIssueSnapshot, ExecutorTestBed, TEST_PROJECT_ID } from "@/test/executor_test_bed.js";

const ISSUE_1 = buildIssueSnapshot(1);
const BRANCH_DIFF = "diff --git a/src/a.ts b/src/a.ts\n+export const a = 1;\n";
const HOUR_MS = 60 * 60 * 1_000;
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const PENDING_APPROVALS_URL = `/api/projects/${TEST_PROJECT_ID}/approvals?status=pending`;

describe("approvals routes", () => {
    let bed: ExecutorTestBed;
    let app: FastifyInstance;

    beforeEach(async () => {
        bed = new ExecutorTestBed([ISSUE_1]);
        bed.runtime.scriptDiff(BRANCH_DIFF);
        app = await buildApp(bed.buildAppDeps());
    });

    afterEach(async () => {
        await app.close();
        bed.close();
    });

    async function startRunWaitingAtGate(gateConfig: Partial<GateConfig> = {}): Promise<RunRecord> {
        const flowId = await bed.publishFlow(buildApprovalFlow(gateConfig));
        const run = await bed.startRun(flowId);
        await bed.advanceUntil(
            async () => (await gateStatusOf(bed, run.id)) === "WAITING_APPROVAL",
        );

        return run;
    }

    async function pendingApprovals(): Promise<Approval[]> {
        const response = await app.inject({ method: "GET", url: PENDING_APPROVALS_URL });
        return response.json<Approval[]>();
    }

    async function theOnlyPendingApproval(): Promise<Approval> {
        const [approval] = await pendingApprovals();
        if (!approval) {
            throw new Error("No pending approval");
        }

        return approval;
    }

    function resolve(approvalId: string, payload: object) {
        return app.inject({ method: "POST", url: `/api/approvals/${approvalId}/resolve`, payload });
    }

    describe("GET /api/projects/:projectId/approvals?status=pending", () => {
        it("lists the approval the gate asked for, with the branch diff", async () => {
            const run = await startRunWaitingAtGate();

            const approvals = await pendingApprovals();

            const gate = await bed.findNodeRun(run.id, "gate");
            expect(approvals).toEqual([
                expect.objectContaining({
                    projectId: TEST_PROJECT_ID,
                    runId: run.id,
                    nodeRunId: gate.id,
                    workItemId: ISSUE_1.id,
                    message: "Revise o diff",
                    diff: BRANCH_DIFF,
                    status: "pending",
                }),
            ]);
        });
    });

    describe("GET /api/approvals/:id", () => {
        it("answers the approval", async () => {
            await startRunWaitingAtGate();
            const pending = await theOnlyPendingApproval();

            const response = await app.inject({
                method: "GET",
                url: `/api/approvals/${pending.id}`,
            });

            expect(response.statusCode).toBe(HTTP_OK);
            expect(response.json()).toEqual(pending);
        });

        it("answers 404 for an approval that does not exist", async () => {
            const response = await app.inject({ method: "GET", url: "/api/approvals/apv_missing" });

            expect(response.statusCode).toBe(HTTP_NOT_FOUND);
        });
    });

    describe("POST /api/approvals/:id/resolve", () => {
        it("goes on through the approved port when approved", async () => {
            const run = await startRunWaitingAtGate();
            const pending = await theOnlyPendingApproval();

            const response = await resolve(pending.id, { decision: "approved" });
            const finished = await bed.runUntilFinished(run.id);

            expect(response.statusCode).toBe(HTTP_OK);
            expect(response.json()).toMatchObject({ id: pending.id, status: "approved" });
            expect(finished.status).toBe("SUCCEEDED");
            expect((await bed.findNodeRun(run.id, "done")).status).toBe("SUCCEEDED");
            expect((await bed.findNodeRun(run.id, "rework")).status).toBe("SKIPPED");
        });

        it("goes on through the rejected port with the comment when rejected", async () => {
            const run = await startRunWaitingAtGate();
            const pending = await theOnlyPendingApproval();

            await resolve(pending.id, { decision: "rejected", comment: "Faltam testes" });
            await bed.runUntilFinished(run.id);

            const gate = await bed.findNodeRun(run.id, "gate");
            expect(gate.outputs?.rejected).toMatchObject({ id: ISSUE_1.id });
            expect(gate.outputs?.comment).toBe("Faltam testes");
            expect((await bed.findNodeRun(run.id, "rework")).status).toBe("SUCCEEDED");
            expect((await bed.findNodeRun(run.id, "done")).status).toBe("SKIPPED");
        });

        it("answers 409 when the approval was already resolved", async () => {
            await startRunWaitingAtGate();
            const pending = await theOnlyPendingApproval();
            await resolve(pending.id, { decision: "approved" });

            const response = await resolve(pending.id, { decision: "rejected" });

            expect(response.statusCode).toBe(HTTP_CONFLICT);
        });

        it("answers 400 for a decision that is neither approved nor rejected", async () => {
            await startRunWaitingAtGate();
            const pending = await theOnlyPendingApproval();

            const response = await resolve(pending.id, { decision: "maybe" });

            expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
        });
    });

    describe("gate timeout", () => {
        it("rejects the approval with 'tempo esgotado' once the timeout passes", async () => {
            const run = await startRunWaitingAtGate({ timeoutHours: 1 });
            const pending = await theOnlyPendingApproval();

            await bed.advanceBy(HOUR_MS);
            await bed.runUntilFinished(run.id);

            const gate = await bed.findNodeRun(run.id, "gate");
            expect(gate.outputs?.comment).toBe("tempo esgotado");
            expect((await bed.findNodeRun(run.id, "rework")).status).toBe("SUCCEEDED");
            expect((await bed.approvals.get(pending.id)).status).toBe("expired");
        });
    });

    describe("server restart", () => {
        it("keeps the gate waiting, and resolving it afterwards still continues the run", async () => {
            const run = await startRunWaitingAtGate();
            const pending = await theOnlyPendingApproval();
            const restarted = await bed.restartServer();
            const restartedApp = await buildApp(restarted.buildAppDeps());

            await recoverOn(restarted);
            const gateAfterRestart = await gateStatusOf(restarted, run.id);
            await restartedApp.inject({
                method: "POST",
                url: `/api/approvals/${pending.id}/resolve`,
                payload: { decision: "approved" },
            });
            const finished = await restarted.runUntilFinished(run.id);
            await restartedApp.close();

            expect(gateAfterRestart).toBe("WAITING_APPROVAL");
            expect(finished.status).toBe("SUCCEEDED");
        });
    });
});

async function gateStatusOf(bed: ExecutorTestBed, runId: string): Promise<string | undefined> {
    const [gate] = await bed.nodeRunsOf(runId, "gate");
    return gate?.status;
}

function recoverOn(restarted: ExecutorTestBed) {
    return recoverRuns({
        runs: restarted.runs,
        executor: restarted.executor,
        runtime: restarted.runtime,
        clock: restarted.clock,
        log: () => undefined,
    });
}
