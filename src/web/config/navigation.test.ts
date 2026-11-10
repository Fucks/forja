import { switchProjectPath, triggersPath } from "@/web/config/navigation.js";

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
