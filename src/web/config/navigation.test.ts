import { nodeRunPath, switchProjectPath, triggersPath } from "@/web/config/navigation.js";

describe("switchProjectPath", () => {
    it.each([
        { from: "/projects/forja/runs", to: "/projects/outro/runs" },
        { from: "/projects/forja/flows/review/versions", to: "/projects/outro/flows" },
        { from: "/projects/forja", to: "/projects/outro" },
        { from: "/settings/credentials", to: "/projects/outro" },
        { from: "/", to: "/projects/outro" },
    ])("goes from $from to $to", ({ from, to }) => {
        expect(switchProjectPath(from, "outro")).toBe(to);
    });
});

describe("triggersPath", () => {
    it("points to the triggers area of the project", () => {
        expect(triggersPath("forja")).toBe("/projects/forja/triggers");
    });
});

describe("nodeRunPath", () => {
    it("points to the run with the NodeRun to open in the query", () => {
        expect(nodeRunPath("forja", "run_1", "nr_dev")).toBe(
            "/projects/forja/runs/run_1?nodeRun=nr_dev",
        );
    });
});
