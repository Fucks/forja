import {
    headlessLabels,
    toContainerPath,
    workspaceIdFor,
} from "@/integrations/agent_runtime/workspace_layout.js";

describe("workspaceIdFor", () => {
    it("joins the last 8 lowercase letters and digits of the run and the item", () => {
        const id = workspaceIdFor("run_01J9ZK3M4N5P6Q7R8S9T0V1W2X", "issue/42");

        expect(id).toBe("forja-9t0v1w2x-issue42");
    });
});

describe("toContainerPath", () => {
    it("keeps POSIX paths as they are", () => {
        expect(toContainerPath("/repos/forja/.git")).toBe("/repos/forja/.git");
    });

    it("maps a Windows drive path to the path Docker Desktop exposes", () => {
        expect(toContainerPath("C:\\Users\\ana\\forja\\.git")).toBe("/c/Users/ana/forja/.git");
    });
});

describe("headlessLabels", () => {
    it("labels the run and the project, plus the item when there is one", () => {
        const spec = {
            projectId: "prj_1",
            runId: "run_1",
            repoPath: "/repos/forja",
            baseBranch: "main",
            image: "forja/agent:latest",
            env: {},
            setupCommands: [],
        };

        expect(headlessLabels(spec)).toEqual({ "forja.run": "run_1", "forja.project": "prj_1" });
        expect(headlessLabels({ ...spec, workItemId: "itm_1" })).toMatchObject({
            "forja.item": "itm_1",
        });
    });
});
