import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NODE_RUN_STATUS_NAMES, RUN_STATUS_NAMES } from "@/shared/events.js";
import { EXECUTION_STATUS_STYLES } from "@/web/components/ui/execution_status.js";

const TOKENS_CSS = readFileSync(resolve(import.meta.dirname, "../../styles/tokens.css"), "utf8");
const ALL_STATUS_NAMES = [...new Set([...NODE_RUN_STATUS_NAMES, ...RUN_STATUS_NAMES])];

describe("EXECUTION_STATUS_STYLES", () => {
    it.each(ALL_STATUS_NAMES)("has a label and an icon for %s", (status) => {
        const style = EXECUTION_STATUS_STYLES[status];

        expect(style.label).not.toBe("");
        expect(style.icon).toBeDefined();
    });

    it.each(ALL_STATUS_NAMES)("paints %s with a status color declared in tokens.css", (status) => {
        const { colorVar } = EXECUTION_STATUS_STYLES[status];

        expect(colorVar).toMatch(/^--status-/);
        expect(TOKENS_CSS).toContain(`${colorVar}:`);
    });

    it("has no style for a name that is not a status", () => {
        const styledStatuses = Object.keys(EXECUTION_STATUS_STYLES).sort();

        expect(styledStatuses).toEqual([...ALL_STATUS_NAMES].sort());
    });

    it("animates only the running status", () => {
        const animatedStatuses = ALL_STATUS_NAMES.filter(
            (status) => EXECUTION_STATUS_STYLES[status].animated,
        );

        expect(animatedStatuses).toEqual(["RUNNING"]);
    });
});
