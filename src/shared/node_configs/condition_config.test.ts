import type { Condition } from "@/shared/conditions.js";
import { conditionConfigSchema, MAX_BRANCHES } from "@/shared/node_configs/condition_config.js";
import type { SwitchBranch } from "@/shared/node_configs/condition_config.js";

const APPROVED: Condition = { op: "eq", path: "inputs.value.approved", value: true };

describe("conditionConfigSchema", () => {
    it("reads a decision saved without a mode as a yes/no decision", () => {
        const config = conditionConfigSchema.parse({ condition: APPROVED });

        expect(config).toEqual({ mode: "if", condition: APPROVED });
    });

    it("turns the otherwise branch on when a switch does not say", () => {
        const config = conditionConfigSchema.parse({
            mode: "switch",
            branches: [buildBranch("approved")],
        });

        expect(config).toEqual({
            mode: "switch",
            branches: [buildBranch("approved")],
            otherwise: true,
        });
    });

    it("refuses a switch without branches", () => {
        const result = conditionConfigSchema.safeParse({ mode: "switch", branches: [] });

        expect(result.success).toBe(false);
    });

    it("refuses a switch with more than ten branches", () => {
        const branches = Array.from({ length: MAX_BRANCHES + 1 }, (_, index) =>
            buildBranch(`branch${index + 1}`),
        );

        const result = conditionConfigSchema.safeParse({ mode: "switch", branches });

        expect(result.success).toBe(false);
    });

    it("refuses a branch whose port is not a port name", () => {
        const result = conditionConfigSchema.safeParse({
            mode: "switch",
            branches: [buildBranch("Precisa de ajustes")],
        });

        expect(result.success).toBe(false);
    });

    it("refuses a branch without a label", () => {
        const result = conditionConfigSchema.safeParse({
            mode: "switch",
            branches: [{ ...buildBranch("approved"), label: "" }],
        });

        expect(result.success).toBe(false);
    });
});

function buildBranch(port: string): SwitchBranch {
    return { port, label: "Aprovado", condition: APPROVED };
}
