import { asNodeOfType } from "@/server/runtime/executors/node_of_type.js";
import type { NodeExecutionContext, NodeExecutionResult } from "@/server/runtime/node_executors.js";

// The board reads it to show the item in "Concluído" or "Precisa de humano".
const ITEM_OUTCOME_ARTIFACT = "item_outcome";

export function executeOutputNode(context: NodeExecutionContext): Promise<NodeExecutionResult> {
    const { config } = asNodeOfType(context.node, "output");

    return Promise.resolve({
        outputs: {},
        artifacts: [
            { name: ITEM_OUTCOME_ARTIFACT, kind: "json", value: { moveItemTo: config.moveItemTo } },
        ],
    });
}
