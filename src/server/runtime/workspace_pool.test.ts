import type { AgentRunHooks, WorkspaceSpec } from "@/integrations/agent_runtime/agent_runtime.js";
import { createWorkspacePool, type WorkspacePool } from "@/server/runtime/workspace_pool.js";
import type { WorkItemSnapshot } from "@/shared/work_item_types.js";
import { FakeAgentRuntime } from "@/test/fakes/fake_agent_runtime.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";

const SILENT_HOOKS: AgentRunHooks = { onEvent: () => undefined };
const ISSUE_7: WorkItemSnapshot = buildSnapshot(7);
const ISSUE_8: WorkItemSnapshot = buildSnapshot(8);

describe("WorkspacePool", () => {
    let runtime: FakeAgentRuntime;
    let pool: WorkspacePool;

    beforeEach(() => {
        runtime = new FakeAgentRuntime({ clock: new FakeClock() });
        pool = createWorkspacePool({ runtime, specOf: workspaceSpecOf });
    });

    function opening(signal = new AbortController().signal): {
        hooks: AgentRunHooks;
        signal: AbortSignal;
    } {
        return { hooks: SILENT_HOOKS, signal };
    }

    function callsOf(kind: "open" | "close"): string[] {
        return runtime.calls
            .filter((call) => call.kind === kind)
            .map((call) => call.workItemId ?? "");
    }

    it("opens the workspace once when the same item asks for it concurrently", async () => {
        const [first, second] = await Promise.all([
            pool.acquire(ISSUE_7, opening()),
            pool.acquire(ISSUE_7, opening()),
        ]);

        expect(first).toBe(second);
        expect(callsOf("open")).toEqual([ISSUE_7.id]);
    });

    it("opens each item on its own branch", async () => {
        const workspace7 = await pool.acquire(ISSUE_7, opening());
        const workspace8 = await pool.acquire(ISSUE_8, opening());

        expect(workspace7.branch).toBe("forja/issue-7");
        expect(workspace8.branch).toBe("forja/issue-8");
    });

    it("closes the workspace of the item on release", async () => {
        await pool.acquire(ISSUE_7, opening());

        await pool.release(ISSUE_7.id);

        expect(callsOf("close")).toEqual([ISSUE_7.id]);
        await expect(runtime.listOpenWorkspaces()).resolves.toEqual([]);
    });

    it("does nothing when releasing an item that never opened a workspace", async () => {
        await pool.release(ISSUE_7.id);

        expect(callsOf("close")).toEqual([]);
    });

    it("opens again after a failed open", async () => {
        const canceled = new AbortController();
        canceled.abort();
        await expect(pool.acquire(ISSUE_7, opening(canceled.signal))).rejects.toThrow();

        await pool.acquire(ISSUE_7, opening());

        expect(callsOf("open")).toEqual([ISSUE_7.id, ISSUE_7.id]);
    });

    it("closes every open workspace on releaseAll", async () => {
        await pool.acquire(ISSUE_7, opening());
        await pool.acquire(ISSUE_8, opening());

        await pool.releaseAll();

        expect(callsOf("close")).toEqual([ISSUE_7.id, ISSUE_8.id]);
    });
});

function buildSnapshot(number: number): WorkItemSnapshot {
    return {
        id: `itm_issue${number}`,
        title: `Issue ${number}`,
        body: "",
        number,
        labels: [],
        branch: `forja/issue-${number}`,
    };
}

function workspaceSpecOf(item: WorkItemSnapshot): WorkspaceSpec {
    return {
        projectId: "prj_forja",
        runId: "run_1",
        workItemId: item.id,
        repoPath: "/repos/forja",
        branch: item.branch,
        baseBranch: "main",
        image: "forja-agent:latest",
        env: {},
        setupCommands: [],
        files: [],
    };
}
