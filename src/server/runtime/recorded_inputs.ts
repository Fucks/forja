import type { NodeRunState } from "@/engine/node_run_state.js";

export const MAX_RECORDED_INPUTS_BYTES = 256 * 1024;

const TRUNCATED_INPUTS = { truncated: true };

// The NodeRun screen shows the inputs; a huge list of items would bloat every saved NodeRun.
export function limitRecordedInputs(nodeRun: NodeRunState): NodeRunState {
    if (!nodeRun.inputs || byteLengthOf(nodeRun.inputs) <= MAX_RECORDED_INPUTS_BYTES) {
        return nodeRun;
    }

    return { ...nodeRun, inputs: TRUNCATED_INPUTS };
}

function byteLengthOf(inputs: Record<string, unknown>): number {
    return Buffer.byteLength(JSON.stringify(inputs));
}
