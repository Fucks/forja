import type { FastifyInstance } from "fastify";

import { buildApp } from "@/server/app.js";
import type { Condition } from "@/shared/conditions.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import type { SerializedRunRecord, SerializedRunView } from "@/shared/run_types.js";
import { buildIssueSnapshot, ExecutorTestBed, TEST_PROJECT_ID } from "@/test/executor_test_bed.js";
import {
    buildCanonicalFlow,
    connect,
    createNodeOfType,
} from "@/test/factories/flow_graph_factory.js";
import { addEdges, addNodes } from "@/test/factories/flow_graph_variations.js";
import {
    evaluateConditionPreview,
    findConditionPreviewSample,
} from "@/web/canvas/inspector/evaluate_condition_preview.js";
import type { ConditionPreview } from "@/web/canvas/inspector/evaluate_condition_preview.js";

const ISSUE = buildIssueSnapshot(1);
const DECISION_ID = "check";
const REVIEW_PROMPT = "Revise o branch";
const REVIEW_GROUP_ID = "review_and_open_pr";
const AGENT_DURATION_MS = 1_000;
const REVIEW_APPROVED: Condition = {
    op: "eq",
    path: "nodes.reviewer.result.approved",
    value: true,
};
const INPUT_APPROVED: Condition = { op: "eq", path: "inputs.value.approved", value: true };

// The editor's preview reads the run views the run routes answer, recorded in SQLite.
describe("Decisão preview on a run recorded by the run routes", () => {
    let bed: ExecutorTestBed;
    let app: FastifyInstance;

    beforeEach(async () => {
        bed = new ExecutorTestBed([ISSUE]);
        app = await buildApp(bed.buildAppDeps());
    });

    afterEach(async () => {
        await app.close();
        bed.close();
    });

    it("takes Não, explaining the value, when the reviewer did not approve", async () => {
        const runView = await runReviewThatApproves(false);

        const sample = findConditionPreviewSample([runView], DECISION_ID);

        expect(sample).toMatchObject({ runId: runView.run.id, workItemId: ISSUE.id });
        expect(previewOf(runView, REVIEW_APPROVED)).toEqual({
            branch: "no",
            explanation: "approved = false",
        });
    });

    it("takes Sim when the reviewer approved", async () => {
        const runView = await runReviewThatApproves(true);

        const preview = previewOf(runView, REVIEW_APPROVED);

        expect(preview.branch).toBe("yes");
    });

    it("reads the decision's inputs too, as v1 decisions do", async () => {
        const runView = await runReviewThatApproves(true);

        const preview = previewOf(runView, INPUT_APPROVED);

        expect(preview.branch).toBe("yes");
    });

    async function runReviewThatApproves(isApproved: boolean): Promise<SerializedRunView> {
        bed.runtime.script({
            match: { promptIncludes: REVIEW_PROMPT },
            durationMs: AGENT_DURATION_MS,
            result: { output: { approved: isApproved, notes: "revisado" } },
        });
        const flowId = await bed.publishFlow(buildReviewDecisionFlow());
        const started = await app.inject({
            method: "POST",
            url: `/api/projects/${TEST_PROJECT_ID}/runs`,
            payload: { flowId, itemIds: [ISSUE.id] },
        });
        const run = started.json<SerializedRunRecord>();
        await bed.runUntilFinished(run.id);

        const view = await app.inject({ method: "GET", url: `/api/runs/${run.id}` });
        return view.json<SerializedRunView>();
    }
});

function previewOf(runView: SerializedRunView, condition: Condition): ConditionPreview {
    const sample = findConditionPreviewSample([runView], DECISION_ID);
    if (!sample) {
        throw new Error("The run has no NodeRun of the decision");
    }

    return evaluateConditionPreview(condition, sample);
}

// The canonical flow with a Decisão after the Reviewer, inside the map of each item.
function buildReviewDecisionFlow(): FlowGraph {
    const decision = createNodeOfType("condition", DECISION_ID, { x: 0, y: 0 });
    const withDecision = addNodes(buildCanonicalFlow(), [
        {
            ...decision,
            parentGroupId: REVIEW_GROUP_ID,
            config: { mode: "if", condition: REVIEW_APPROVED },
        },
    ]);

    return addEdges(withDecision, [connect(["reviewer", "result"], [DECISION_ID, "value"])]);
}
