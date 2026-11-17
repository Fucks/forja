import {
    CONDITION_PATH_SEPARATOR,
    evaluateCondition,
    listComparisons,
    lookUpPath,
} from "@/shared/conditions.js";
import type { Condition } from "@/shared/conditions.js";
import type { DataContext } from "@/shared/data_context.js";
import { nodeSlug } from "@/shared/node_slug.js";
import type { SerializedNodeRun, SerializedRunView } from "@/shared/run_types.js";
import type { ConditionBranch } from "@/web/canvas/inspector/condition_branch_label.js";

/** What the decision could read in a recorded run: its inputs and the outputs before it. */
export interface ConditionPreviewSample {
    runId: string;
    workItemId?: string;
    data: Pick<DataContext, "inputs" | "nodes" | "run">;
}

export interface ConditionPreview {
    branch: ConditionBranch;
    explanation: string;
}

type NodeOutputs = Record<string, unknown>;

const EXPLANATION_SEPARATOR = ", ";
const MISSING_VALUE_TEXT = "não existe";

/** The data of the decision's last NodeRun, in the newest of the runs (newest first) that ran it. */
export function findConditionPreviewSample(
    runViews: SerializedRunView[],
    decisionId: string,
): ConditionPreviewSample | undefined {
    for (const view of runViews) {
        const decisionRun = findLastNodeRun(view.nodeRuns, decisionId);
        if (decisionRun) {
            return buildSample(view, decisionRun);
        }
    }

    return undefined;
}

/** The branch the rule takes on the sample, and the values it read to get there. */
export function evaluateConditionPreview(
    condition: Condition,
    sample: ConditionPreviewSample,
): ConditionPreview {
    const branch = evaluateCondition(condition, sample.data) ? "yes" : "no";

    return { branch, explanation: explainReadValues(condition, sample) };
}

function findLastNodeRun(
    nodeRuns: SerializedNodeRun[],
    nodeId: string,
): SerializedNodeRun | undefined {
    return nodeRuns.filter((nodeRun) => nodeRun.nodeId === nodeId).at(-1);
}

// The NodeRun keeps only the decision's inputs, so `nodes.*` is rebuilt from the earlier nodes.
function buildSample(
    view: SerializedRunView,
    decisionRun: SerializedNodeRun,
): ConditionPreviewSample {
    const nodeOutputs = view.graph.nodes.flatMap<[string, NodeOutputs]>((node) => {
        const outputs = findOutputsForItem(view.nodeRuns, node.id, decisionRun.workItemId);
        return outputs ? [[nodeSlug(node.label), outputs]] : [];
    });

    return {
        runId: view.run.id,
        workItemId: decisionRun.workItemId,
        data: {
            inputs: decisionRun.inputs ?? {},
            nodes: Object.fromEntries(nodeOutputs),
            run: {
                id: view.run.id,
                iteration: decisionRun.iteration,
                attempt: decisionRun.attempt,
            },
        },
    };
}

// A node outside the item's map ran once for the whole run, without an item.
function findOutputsForItem(
    nodeRuns: SerializedNodeRun[],
    nodeId: string,
    workItemId: string | undefined,
): NodeOutputs | undefined {
    const finishedRuns = nodeRuns.filter(
        (nodeRun) => nodeRun.nodeId === nodeId && nodeRun.outputs !== undefined,
    );
    const runOfItem = finishedRuns.filter((nodeRun) => nodeRun.workItemId === workItemId).at(-1);
    const runOfWholeRun = finishedRuns.filter((nodeRun) => nodeRun.workItemId === undefined).at(-1);

    return (runOfItem ?? runOfWholeRun)?.outputs;
}

function explainReadValues(condition: Condition, sample: ConditionPreviewSample): string {
    const readPaths = new Set(listComparisons(condition).map((comparison) => comparison.path));

    return [...readPaths].map((path) => explainValueAt(path, sample)).join(EXPLANATION_SEPARATOR);
}

function explainValueAt(path: string, sample: ConditionPreviewSample): string {
    const name = path.split(CONDITION_PATH_SEPARATOR).at(-1) ?? path;
    const lookup = lookUpPath(sample.data, path);
    if (!lookup.isFound) {
        return `${name} ${MISSING_VALUE_TEXT}`;
    }

    return `${name} = ${JSON.stringify(lookup.value)}`;
}
