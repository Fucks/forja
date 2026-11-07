import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
    EXECUTION_STATUS_STYLES,
    EXECUTION_STATUSES,
} from "@/web/components/ui/execution_status.js";

const TOKENS_CSS = readFileSync(resolve(import.meta.dirname, "../../styles/tokens.css"), "utf8");

describe("EXECUTION_STATUS_STYLES", () => {
    it.each(EXECUTION_STATUSES)("has a label and an icon for %s", (status) => {
        const style = EXECUTION_STATUS_STYLES[status];

        expect(style.label).not.toBe("");
        expect(style.icon).toBeDefined();
    });

    it.each(EXECUTION_STATUSES)(
        "paints %s with a status color declared in tokens.css",
        (status) => {
            const { colorVar } = EXECUTION_STATUS_STYLES[status];

            expect(colorVar).toMatch(/^--status-/);
            expect(TOKENS_CSS).toContain(`${colorVar}:`);
        },
    );

    it("has no style for a name that is not a status", () => {
        const styledStatuses = Object.keys(EXECUTION_STATUS_STYLES).sort();

        expect(styledStatuses).toEqual([...EXECUTION_STATUSES].sort());
    });

    it("animates only the running status", () => {
        const animatedStatuses = EXECUTION_STATUSES.filter(
            (status) => EXECUTION_STATUS_STYLES[status].animated,
        );

        expect(animatedStatuses).toEqual(["RUNNING"]);
    });
});
