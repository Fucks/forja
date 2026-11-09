import { decidePolicy } from "@/server/triggers/concurrency_policy.js";

const ACTIVE_RUN_IDS = ["run_1"];

describe("decidePolicy", () => {
    it.each(["skip", "queue", "parallel"] as const)(
        "starts a run when no run of the flow is active, whatever the policy (%s)",
        (policy) => {
            expect(decidePolicy(policy, [])).toBe("start");
        },
    );

    it("skips the fire when a run is active and the policy is skip", () => {
        expect(decidePolicy("skip", ACTIVE_RUN_IDS)).toBe("skip");
    });

    it("enqueues the fire when a run is active and the policy is queue", () => {
        expect(decidePolicy("queue", ACTIVE_RUN_IDS)).toBe("enqueue");
    });

    it("starts another run when a run is active and the policy is parallel", () => {
        expect(decidePolicy("parallel", ACTIVE_RUN_IDS)).toBe("start");
    });
});
