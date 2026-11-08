import {
    limitRecordedInputs,
    MAX_RECORDED_INPUTS_BYTES,
} from "@/server/runtime/recorded_inputs.js";
import { buildNodeRunState } from "@/test/factories/node_run_state_factory.js";

describe("limitRecordedInputs", () => {
    it("keeps inputs up to 256 KB as they are", () => {
        const nodeRun = buildNodeRunState({ status: "RUNNING", inputs: { spec: "Tela de login" } });

        expect(limitRecordedInputs(nodeRun)).toEqual(nodeRun);
    });

    it("records inputs above 256 KB as truncated", () => {
        const hugeSpec = "x".repeat(MAX_RECORDED_INPUTS_BYTES + 1);
        const nodeRun = buildNodeRunState({ status: "RUNNING", inputs: { spec: hugeSpec } });

        expect(limitRecordedInputs(nodeRun).inputs).toEqual({ truncated: true });
    });

    it("leaves a NodeRun without inputs alone", () => {
        const nodeRun = buildNodeRunState();

        expect(limitRecordedInputs(nodeRun)).toEqual(nodeRun);
    });
});
