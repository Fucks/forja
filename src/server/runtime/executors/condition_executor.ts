import { asNodeOfType } from "@/server/runtime/executors/node_of_type.js";
import { ITEM_OUTCOME_ARTIFACT } from "@/server/runtime/executors/output_executor.js";
import type { NodeExecutionContext, NodeExecutionResult } from "@/server/runtime/node_executors.js";
import { buildDataContext } from "@/server/runtime/run_context.js";
import { chooseBranchPort } from "@/shared/node_configs/condition_branches.js";

const CONDITION_INPUT_PORT = "value";

// Only the chosen port gets the value, so the scheduler skips the other branches.
export function executeConditionNode(context: NodeExecutionContext): Promise<NodeExecutionResult> {
    const decision = asNodeOfType(context.node, "condition");
    const chosenPort = chooseBranchPort(decision.config, buildDataContext(context));
    if (chosenPort === undefined) {
        return Promise.resolve(sendItemToHuman(decision.label));
    }

    const value = context.inputs[CONDITION_INPUT_PORT];
    return Promise.resolve({ outputs: { [chosenPort]: value } });
}

// Without outputs every branch is skipped, so the item would otherwise stop with no destination.
function sendItemToHuman(decisionLabel: string): NodeExecutionResult {
    return {
        outputs: {},
        artifacts: [
            {
                name: ITEM_OUTCOME_ARTIFACT,
                kind: "json",
                value: {
                    moveItemTo: "needs_human",
                    reason: `Nenhum caminho da Decisão ${decisionLabel} se aplicou`,
                },
            },
        ],
    };
}
