import type { Condition } from "@/shared/conditions.js";
import type { SerializedNodeRun, SerializedRunView } from "@/shared/run_types.js";
import {
    buildSerializedNodeRun,
    buildSerializedRunView,
} from "@/test/factories/run_view_factory.js";
import {
    evaluateConditionPreview,
    findConditionPreviewSample,
} from "@/web/canvas/inspector/evaluate_condition_preview.js";
import type { ConditionPreviewSample } from "@/web/canvas/inspector/evaluate_condition_preview.js";

const DECISION_ID = "check";
const FIRST_ITEM_ID = "itm_1";
const SECOND_ITEM_ID = "itm_2";
const REVIEWER_APPROVED: Condition = {
    op: "eq",
    path: "nodes.reviewer.result.approved",
    value: true,
};

describe("findConditionPreviewSample", () => {
    it("takes the run and the item of the decision's last NodeRun in the newest run", () => {
        const newestRun = buildRunView("run_new", [
            reviewerRun(FIRST_ITEM_ID, true),
            decisionRun(FIRST_ITEM_ID),
            reviewerRun(SECOND_ITEM_ID, false),
            decisionRun(SECOND_ITEM_ID),
        ]);
        const olderRun = buildRunView("run_old", [decisionRun(FIRST_ITEM_ID)]);

        const sample = findConditionPreviewSample([newestRun, olderRun], DECISION_ID);

        expect(sample).toMatchObject({ runId: "run_new", workItemId: SECOND_ITEM_ID });
    });

    it("skips the runs that did not run the decision", () => {
        const runWithoutDecision = buildRunView("run_new", [reviewerRun(FIRST_ITEM_ID, true)]);
        const runWithDecision = buildRunView("run_old", [decisionRun(FIRST_ITEM_ID)]);

        const sample = findConditionPreviewSample(
            [runWithoutDecision, runWithDecision],
            DECISION_ID,
        );

        expect(sample?.runId).toBe("run_old");
    });

    it("finds no sample before the decision ever ran", () => {
        const run = buildRunView("run_new", [reviewerRun(FIRST_ITEM_ID, true)]);

        expect(findConditionPreviewSample([run], DECISION_ID)).toBeUndefined();
    });
});

describe("evaluateConditionPreview", () => {
    it("takes Sim when the rule holds on the outputs of the earlier nodes", () => {
        const sample = sampleOf([reviewerRun(FIRST_ITEM_ID, true), decisionRun(FIRST_ITEM_ID)]);

        const preview = evaluateConditionPreview(REVIEWER_APPROVED, sample);

        expect(preview).toEqual({ branch: "yes", explanation: "approved = true" });
    });

    it("takes Não when the rule does not hold", () => {
        const sample = sampleOf([reviewerRun(FIRST_ITEM_ID, false), decisionRun(FIRST_ITEM_ID)]);

        const preview = evaluateConditionPreview(REVIEWER_APPROVED, sample);

        expect(preview).toEqual({ branch: "no", explanation: "approved = false" });
    });

    it("reads the outputs of the same item the decision ran for", () => {
        const sample = sampleOf([
            reviewerRun(FIRST_ITEM_ID, false),
            reviewerRun(SECOND_ITEM_ID, true),
            decisionRun(FIRST_ITEM_ID),
        ]);

        const preview = evaluateConditionPreview(REVIEWER_APPROVED, sample);

        expect(preview.branch).toBe("no");
    });

    it("reads the inputs the decision received", () => {
        const sample = sampleOf([
            decisionRun(FIRST_ITEM_ID, { value: { approved: true, notes: "ok" } }),
        ]);

        const preview = evaluateConditionPreview(
            { op: "contains", path: "inputs.value.notes", value: "ok" },
            sample,
        );

        expect(preview).toEqual({ branch: "yes", explanation: 'notes = "ok"' });
    });

    it("explains every value the rule read, including the missing ones", () => {
        const sample = sampleOf([reviewerRun(FIRST_ITEM_ID, true), decisionRun(FIRST_ITEM_ID)]);

        const preview = evaluateConditionPreview(
            {
                op: "and",
                conditions: [
                    REVIEWER_APPROVED,
                    { op: "isNotEmpty", path: "nodes.reviewer.result.notes" },
                ],
            },
            sample,
        );

        expect(preview).toEqual({
            branch: "no",
            explanation: "approved = true, notes não existe",
        });
    });
});

function buildRunView(runId: string, nodeRuns: SerializedNodeRun[]): SerializedRunView {
    const view = buildSerializedRunView({ nodeRuns });

    return { ...view, run: { ...view.run, id: runId } };
}

function reviewerRun(workItemId: string, isApproved: boolean): SerializedNodeRun {
    return buildSerializedNodeRun({
        id: `reviewer_${workItemId}`,
        nodeId: "reviewer",
        workItemId,
        status: "SUCCEEDED",
        outputs: { result: { approved: isApproved } },
    });
}

function decisionRun(
    workItemId: string,
    inputs: Record<string, unknown> = { value: {} },
): SerializedNodeRun {
    return buildSerializedNodeRun({
        id: `check_${workItemId}`,
        nodeId: DECISION_ID,
        workItemId,
        status: "SUCCEEDED",
        inputs,
    });
}

function sampleOf(nodeRuns: SerializedNodeRun[]): ConditionPreviewSample {
    const sample = findConditionPreviewSample([buildRunView("run_1", nodeRuns)], DECISION_ID);
    if (!sample) {
        throw new Error("The run has no NodeRun of the decision");
    }

    return sample;
}
