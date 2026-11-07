import type { NodeRunState } from "@/engine/node_run_state.js";

export function buildNodeRunState(overrides: Partial<NodeRunState> = {}): NodeRunState {
    return {
        id: "node-run-1",
        runId: "run-1",
        nodeId: "node-1",
        iteration: 0,
        attempt: 1,
        groupPath: [],
        status: "PENDING",
        ...overrides,
    };
}
