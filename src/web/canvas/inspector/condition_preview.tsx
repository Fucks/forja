import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { JSX } from "react";

import type { Condition } from "@/shared/conditions.js";
import { projectRunsQueryKey } from "@/web/app/runs/use_runs.js";
import { BranchLabel } from "@/web/canvas/inspector/condition_branch_label.js";
import {
    evaluateConditionPreview,
    findConditionPreviewSample,
} from "@/web/canvas/inspector/evaluate_condition_preview.js";
import type { ConditionPreviewSample } from "@/web/canvas/inspector/evaluate_condition_preview.js";
import {
    fetchRecentRunViews,
    useFlowInEditor,
} from "@/web/canvas/inspector/use_last_node_run_sample.js";
import type { FlowInEditor } from "@/web/canvas/inspector/use_last_node_run_sample.js";
import { describeItem } from "@/web/canvas/live/run_view_model.js";
import { Button } from "@/web/components/ui/button.js";
import { Tooltip } from "@/web/components/ui/tooltip.js";

const SAMPLE_QUERY_KEY = "condition-preview-sample";
const TEST_BUTTON_LABEL = "Testar com o último run";
const NO_RUN_YET_HINT = "Rode o fluxo uma vez para testar com dados reais";
const SHOWN_RUN_ID_LENGTH = 8;

/** Runs the rule over the data the decision had in the last run and shows the branch it takes. */
export function ConditionPreview({
    condition,
    decisionId,
}: {
    condition: Condition;
    decisionId: string;
}): JSX.Element {
    const sample = useConditionPreviewSample(useFlowInEditor(), decisionId);
    const [isShowingResult, setIsShowingResult] = useState(false);

    if (!sample) {
        return <TestButtonWithoutRun />;
    }

    return (
        <div className="flex flex-col gap-1.5 text-sm">
            <Button onClick={() => setIsShowingResult(true)} className="self-start">
                {TEST_BUTTON_LABEL}
            </Button>
            {isShowingResult && <PreviewResult condition={condition} sample={sample} />}
        </div>
    );
}

function useConditionPreviewSample(
    flow: FlowInEditor | undefined,
    decisionId: string,
): ConditionPreviewSample | undefined {
    const sample = useQuery({
        // Under the project's runs key, so whatever reloads the runs reloads the sample too.
        queryKey: [
            ...projectRunsQueryKey(flow?.projectId ?? ""),
            SAMPLE_QUERY_KEY,
            flow?.flowId,
            decisionId,
        ],
        queryFn: () => (flow ? fetchSample(flow, decisionId) : null),
        enabled: flow !== undefined,
    });

    return sample.data ?? undefined;
}

// React Query refuses undefined as query data, so "no sample" travels as null.
async function fetchSample(
    flow: FlowInEditor,
    decisionId: string,
): Promise<ConditionPreviewSample | null> {
    const runViews = await fetchRecentRunViews(flow);

    return findConditionPreviewSample(runViews, decisionId) ?? null;
}

// A disabled button gets no pointer events, so the tooltip hangs on a wrapper that can be focused.
function TestButtonWithoutRun(): JSX.Element {
    return (
        <Tooltip content={NO_RUN_YET_HINT}>
            <span tabIndex={0} aria-label={NO_RUN_YET_HINT} className="self-start">
                <Button disabled>{TEST_BUTTON_LABEL}</Button>
            </span>
        </Tooltip>
    );
}

function PreviewResult({
    condition,
    sample,
}: {
    condition: Condition;
    sample: ConditionPreviewSample;
}): JSX.Element {
    const { branch, explanation } = evaluateConditionPreview(condition, sample);

    return (
        <p role="status">
            {describeSampleOrigin(sample)}: <strong>{explanation}</strong> →{" "}
            <strong>
                <BranchLabel branch={branch} />
            </strong>
        </p>
    );
}

function describeSampleOrigin({ runId, workItemId }: ConditionPreviewSample): string {
    const runText = `Run #${runId.slice(-SHOWN_RUN_ID_LENGTH)}`;
    if (workItemId === undefined) {
        return runText;
    }

    return `${runText} · ${describeItem(workItemId)}`;
}
