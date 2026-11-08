import type { NodeRunState } from "@/engine/node_run_state.js";
import type { PromptContext } from "@/engine/prompt_template.js";
import type { Project } from "@/shared/project_types.js";
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
