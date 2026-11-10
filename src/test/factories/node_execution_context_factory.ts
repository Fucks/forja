import type { NodeExecutionContext } from "@/server/runtime/node_executors.js";
import { buildWorkspaceSpec } from "@/server/runtime/run_context.js";
import { createWorkspacePool } from "@/server/runtime/workspace_pool.js";
import type { FlowNode } from "@/shared/flow_graph.js";
import { DEFAULT_PROJECT_SETTINGS } from "@/shared/settings_types.js";
import { buildNodeRunState } from "@/test/factories/node_run_state_factory.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { buildRunRecord } from "@/test/factories/run_record_factory.js";
import { buildRunCredentials } from "@/test/factories/run_credentials_factory.js";
import { buildRunToolProfiles } from "@/test/factories/run_tool_profiles_factory.js";
import { FakeAgentRuntime } from "@/test/fakes/fake_agent_runtime.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";

// A RUNNING NodeRun of the node, alone in its graph, with the workspaces of the given runtime.
export function buildNodeExecutionContext(
    node: FlowNode,
    overrides: Partial<NodeExecutionContext> = {},
): NodeExecutionContext {
    const clock = new FakeClock();
    const runtime = overrides.runtime ?? new FakeAgentRuntime({ clock });
    const run = buildRunRecord();
    const project = buildProject();
    const settings = DEFAULT_PROJECT_SETTINGS;
    const credentials = buildRunCredentials();

    return {
        run,
        nodeRun: buildNodeRunState({ runId: run.id, nodeId: node.id, status: "RUNNING" }),
        node,
        graph: { schemaVersion: 1, nodes: [node], edges: [], groups: [] },
        inputs: {},
        runItems: [],
        project,
        settings,
        toolProfiles: buildRunToolProfiles(),
        credentials,
        workspaces: createWorkspacePool({
            runtime,
            specOf: (item) => buildWorkspaceSpec({ run, project, settings, credentials }, item, []),
        }),
        runtime,
        clock,
        signal: new AbortController().signal,
        onAgentEvent: () => undefined,
        ...overrides,
    };
}
