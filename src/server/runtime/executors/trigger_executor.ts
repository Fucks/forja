import { TRIGGER_ITEMS_PORT } from "@/engine/scheduler_types.js";
import type { NodeExecutionContext, NodeExecutionResult } from "@/server/runtime/node_executors.js";

export function executeTriggerNode(context: NodeExecutionContext): Promise<NodeExecutionResult> {
    return Promise.resolve({ outputs: { [TRIGGER_ITEMS_PORT]: context.runItems } });
}
