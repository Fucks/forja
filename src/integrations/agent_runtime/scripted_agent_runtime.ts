import { AgentCanceledError } from "@/integrations/agent_runtime/agent_errors.js";
import type {
    AgentRunHooks,
    AgentRunRequest,
    AgentRunResult,
    AgentRuntime,
    ExecResult,
    OpenWorkspaceSummary,
    RuntimeDir,
    Workspace,
    WorkspaceSpec,
} from "@/integrations/agent_runtime/agent_runtime.js";
import {
    playScriptedAgentRun,
    type ScriptedRunSettings,
} from "@/integrations/agent_runtime/scripted_agent_run.js";
import { RUNTIME_DIR_IN_CONTAINER } from "@/integrations/agent_runtime/workspace_layout.js";
import type { Clock } from "@/lib/clock.js";
import { DEMO_SCRIPT, type DemoScript } from "@/server/demo/demo_script.js";

export interface ScriptedAgentRuntimeOptions {
    clock: Clock;
    /** 1 = the default demo pace, each agent run taking 3–8 s. */
    speed?: number;
    script?: DemoScript;
}

const DEFAULT_SPEED = 1;
const WORKSPACE_READY_MESSAGE = "workspace pronto";
const SUCCESSFUL_EXEC: ExecResult = { exitCode: 0, stdoutTail: "" };
const EMPTY_DIFF = "";
// Nothing is written under these: the workspaces of the demo live in memory.
const SCRIPTED_WORKTREES_ROOT = "/forja-demo/worktrees";
const SCRIPTED_RUNTIME_ROOT = "/forja-demo/runtime";

/** Plays simulated agents for the demo mode: real clock, no Docker, no `claude`. */
export function createScriptedAgentRuntime({
    clock,
    speed = DEFAULT_SPEED,
    script = DEMO_SCRIPT,
}: ScriptedAgentRuntimeOptions): AgentRuntime {
    const settings: ScriptedRunSettings = { clock, speed, script };
    const openWorkspaces = new Map<string, OpenWorkspaceSummary>();

    function runAgent(request: AgentRunRequest, hooks: AgentRunHooks): Promise<AgentRunResult> {
        return playScriptedAgentRun(settings, request, hooks);
    }

    function openWorkspace(
        spec: WorkspaceSpec,
        hooks: AgentRunHooks,
        signal: AbortSignal,
    ): Promise<Workspace> {
        if (signal.aborted) {
            return Promise.reject(new AgentCanceledError());
        }

        const id = workspaceIdOf(spec);
        openWorkspaces.set(id, { id, runId: spec.runId, workItemId: spec.workItemId });
        hooks.onEvent({ kind: "system", message: WORKSPACE_READY_MESSAGE, at: clock.now() });

        return Promise.resolve(createInMemoryWorkspace(id, spec.branch));
    }

    function createInMemoryWorkspace(id: string, branch: string): Workspace {
        return {
            id,
            branch,
            root: `${SCRIPTED_WORKTREES_ROOT}/${id}`,
            runtimeDir: scriptedRuntimeDir(id),
            runAgent,
            exec: () => Promise.resolve(SUCCESSFUL_EXEC),
            diff: () => Promise.resolve(EMPTY_DIFF),
            writeFiles: () => Promise.resolve(),
            close: () => closeWorkspace(id),
        };
    }

    function closeWorkspace(id: string): Promise<void> {
        openWorkspaces.delete(id);
        return Promise.resolve();
    }

    return {
        openWorkspace,
        headlessRuntimeDir: (runId, nodeRunId) => scriptedRuntimeDir(`${runId}-${nodeRunId}`),
        runHeadless: (_spec, request, hooks) => runAgent(request, hooks),
        listOpenWorkspaces: () => Promise.resolve([...openWorkspaces.values()]),
        closeWorkspace,
    };
}

function workspaceIdOf(spec: WorkspaceSpec): string {
    return `scripted-${spec.runId}-${spec.workItemId}`;
}

function scriptedRuntimeDir(ownerId: string): RuntimeDir {
    return { host: `${SCRIPTED_RUNTIME_ROOT}/${ownerId}`, container: RUNTIME_DIR_IN_CONTAINER };
}
