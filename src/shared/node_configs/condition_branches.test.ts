import type { Condition } from "@/shared/conditions.js";
import {
    branchPortsOf,
    chooseBranchPort,
    listDecisionConditions,
} from "@/shared/node_configs/condition_branches.js";
import type { SwitchConditionConfig } from "@/shared/node_configs/condition_config.js";

const APPROVED: Condition = { op: "eq", path: "inputs.value.approved", value: true };
const HAS_NOTES: Condition = { op: "isNotEmpty", path: "inputs.value.notes" };
const REVIEW_SWITCH: SwitchConditionConfig = {
    mode: "switch",
    branches: [
        { port: "approved", label: "Aprovado", condition: APPROVED },
        { port: "changes", label: "Ajustes", condition: HAS_NOTES },
    ],
    otherwise: true,
};

describe("branchPortsOf", () => {
    it("gives a yes/no decision the true and false ports", () => {
        const ports = branchPortsOf({ mode: "if", condition: APPROVED });

        expect(ports).toEqual([
            { name: "true", type: "any", required: true },
            { name: "false", type: "any", required: true },
        ]);
    });

    it("gives a switch one port per branch in order and then otherwise", () => {
        const ports = branchPortsOf(REVIEW_SWITCH);

        expect(ports.map((port) => port.name)).toEqual(["approved", "changes", "otherwise"]);
    });

    it("leaves the otherwise port out when the switch has no otherwise", () => {
        const ports = branchPortsOf({ ...REVIEW_SWITCH, otherwise: false });

        expect(ports.map((port) => port.name)).toEqual(["approved", "changes"]);
    });
});

describe("listDecisionConditions", () => {
    it("lists the condition of every branch of a switch", () => {
        expect(listDecisionConditions(REVIEW_SWITCH)).toEqual([APPROVED, HAS_NOTES]);
    });
});

describe("chooseBranchPort", () => {
    it("chooses the first branch that holds", () => {
        const data = { inputs: { value: { approved: true, notes: "ok" } } };

        expect(chooseBranchPort(REVIEW_SWITCH, data)).toBe("approved");
    });

    it("chooses otherwise when no branch holds", () => {
        const data = { inputs: { value: { approved: false, notes: "" } } };

        expect(chooseBranchPort(REVIEW_SWITCH, data)).toBe("otherwise");
    });

    it("chooses no port when no branch holds and there is no otherwise", () => {
        const data = { inputs: { value: { approved: false, notes: "" } } };

        expect(chooseBranchPort({ ...REVIEW_SWITCH, otherwise: false }, data)).toBeUndefined();
    });
});
