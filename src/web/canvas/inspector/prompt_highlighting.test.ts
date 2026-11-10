import { findPromptVariables } from "@/web/canvas/inspector/prompt_highlighting.js";

const KNOWN_PATHS = new Set(["item.title", "inputs.spec"]);

describe("findPromptVariables", () => {
    it("marks the variables that exist for the node as known", () => {
        const variables = findPromptVariables("Resuma {{item.title}}", KNOWN_PATHS);

        expect(variables).toEqual([{ from: 7, to: 21, isKnown: true }]);
    });

    it("marks the variables that do not exist as unknown", () => {
        const variables = findPromptVariables("{{ inputs.spec }} e {{inputs.notes}}", KNOWN_PATHS);

        expect(variables).toEqual([
            { from: 0, to: 17, isKnown: true },
            { from: 20, to: 36, isKnown: false },
        ]);
    });

    it("ignores escaped openings", () => {
        expect(findPromptVariables("Use \\{{literal}}", KNOWN_PATHS)).toEqual([]);
    });
});
