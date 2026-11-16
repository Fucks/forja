import { gateOutputsOf } from "@/engine/gate_decision.js";
import type { NodeRunState } from "@/engine/node_run_state.js";

function waitingGate(overrides: Partial<NodeRunState>): NodeRunState {
    return {
        id: "nrn_gate",
        runId: "run_1",
        nodeId: "gate",
        iteration: 0,
        attempt: 1,
        groupPath: [],
        status: "WAITING_APPROVAL",
        ...overrides,
    };
}

describe("gateOutputsOf", () => {
    it("sends the item of the gate through the port of the decision", () => {
        const gate = waitingGate({ workItemId: "1", inputs: { item: { id: "1", extra: true } } });

        expect(gateOutputsOf(gate, "approved", "ok")).toEqual({
            approved: { id: "1", extra: true },
            comment: "ok",
        });
    });

    it("sends the implicit item when the item port is not wired, so a saved run keeps the decision", () => {
        const gate = waitingGate({ workItemId: "1", inputs: { spike: { summary: "feito" } } });

        const saved: unknown = JSON.parse(JSON.stringify(gateOutputsOf(gate, "approved", undefined)));

        expect(saved).toEqual({ approved: { id: "1" }, comment: "" });
    });

    it("sends true from a gate outside any item", () => {
        const gate = waitingGate({ inputs: {} });

        expect(gateOutputsOf(gate, "rejected", "não")).toEqual({ rejected: true, comment: "não" });
    });
});
