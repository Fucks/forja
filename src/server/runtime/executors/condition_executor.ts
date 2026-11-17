import { asNodeOfType } from "@/server/runtime/executors/node_of_type.js";
import type { NodeExecutionContext, NodeExecutionResult } from "@/server/runtime/node_executors.js";
import { buildDataContext } from "@/server/runtime/run_context.js";
import { evaluateCondition } from "@/shared/conditions.js";

const CONDITION_INPUT_PORT = "value";
const TRUE_BRANCH_PORT = "true";
const FALSE_BRANCH_PORT = "false";

// Only the chosen port gets the value, so the scheduler skips the other branch.
export function executeConditionNode(context: NodeExecutionContext): Promise<NodeExecutionResult> {
    const { config } = asNodeOfType(context.node, "condition");
    const value = context.inputs[CONDITION_INPUT_PORT];
    const chosenPort = evaluateCondition(config.condition, buildDataContext(context))
        ? TRUE_BRANCH_PORT
        : FALSE_BRANCH_PORT;

    return Promise.resolve({ outputs: { [chosenPort]: value } });
}
