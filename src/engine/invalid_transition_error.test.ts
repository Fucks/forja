import { InvalidTransitionError } from "@/engine/invalid_transition_error.js";

describe("InvalidTransitionError", () => {
    it("names the state machine and both states in the message", () => {
        const error = new InvalidTransitionError("Run", "SUCCEEDED", "RUNNING");

        expect(error.message).toBe("Transição inválida de Run: SUCCEEDED → RUNNING");
    });

    it("keeps the rejected states so callers can inspect them", () => {
        const error = new InvalidTransitionError("NodeRun", "PENDING", "SUCCEEDED");

        expect(error).toMatchObject({
            name: "InvalidTransitionError",
            machine: "NodeRun",
            from: "PENDING",
            to: "SUCCEEDED",
        });
    });
});
