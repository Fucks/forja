import type { NodeRunState } from "@/engine/node_run_state.js";
import type { PromptContext } from "@/engine/prompt_template.js";
import type { RunState } from "@/engine/run_state.js";
import type {
    HeadlessSpec,
    SetupCommand,
    WorkspaceSpec,
} from "@/integrations/agent_runtime/agent_runtime.js";
import { buildAgentEnv } from "@/integrations/agent_runtime/agent_env.js";
import type { RunCredentials } from "@/server/runtime/run_credentials.js";
import type { Project } from "@/shared/project_types.js";
import type { ProjectSettings } from "@/shared/settings_types.js";
import type { WorkItemSnapshot } from "@/shared/work_item_types.js";

export interface PromptSources {
    nodeRun: NodeRunState;
    inputs: Record<string, unknown>;
    item?: WorkItemSnapshot;
    project: Project;
}

export function buildPromptContext({
    nodeRun,
    inputs,
    item,
    project,
}: PromptSources): PromptContext {
    return {
        inputs,
        item,
        project: {
            name: project.name,
            baseBranch: project.baseBranch,
            githubRepo: project.githubRepo,
        },
        run: { id: nodeRun.runId, iteration: nodeRun.iteration, attempt: nodeRun.attempt },
    };
}

export interface RunPlace {
    run: RunState;
    project: Project;
    settings: ProjectSettings;
    credentials: RunCredentials;
}

export function buildWorkspaceSpec(
    place: RunPlace,
    item: WorkItemSnapshot,
    setupCommands: SetupCommand[],
): WorkspaceSpec {
    return {
        ...buildHeadlessSpec(place, item),
        workItemId: item.id,
        branch: item.branch,
        setupCommands,
        files: [],
    };
}

// Only the GitHub token: the Claude credential belongs to each agent, so it goes in its request.
export function buildHeadlessSpec(
    { run, project, settings, credentials }: RunPlace,
    item: WorkItemSnapshot | undefined,
): HeadlessSpec {
    return {
        projectId: project.id,
        runId: run.id,
        workItemId: item?.id,
        repoPath: project.repoPath,
        baseBranch: project.baseBranch,
        image: settings.agentImage,
        env: buildAgentEnv({ github: credentials.githubToken, extra: {} }),
        setupCommands: [],
    };
}
