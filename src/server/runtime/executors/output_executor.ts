import { z } from "zod";

import type { NodeRunState } from "@/engine/node_run_state.js";
import { findPrUrl } from "@/server/runs/pr_url_artifact.js";
import { listArtifactsOfNodeRuns } from "@/server/runs/run_repository.js";
import type { RunRepository } from "@/server/runs/run_repository.js";
import { asNodeOfType } from "@/server/runtime/executors/node_of_type.js";
import { buildRunComment } from "@/server/runtime/executors/run_comment.js";
import type {
    NodeExecutionContext,
    NodeExecutionResult,
    NodeExecutor,
} from "@/server/runtime/node_executors.js";
import type { GithubOfProject } from "@/server/work_items/project_github_provider.js";
import type { OutputConfig } from "@/shared/node_configs/output_config.js";

// The board reads it to show the item in "Concluído" or "Precisa de humano".
export const ITEM_OUTCOME_ARTIFACT = "item_outcome";

const reasonSchema = z.string().trim().min(1).optional().catch(undefined);
const explainedInputSchema = z.object({ reason: reasonSchema, notes: reasonSchema });

export interface OutputExecutorDeps {
    runs: RunRepository;
    githubOf: GithubOfProject;
}

interface IssueOfItem {
    githubRepo: string;
    number: number;
    itemId: string;
}

interface IssueComment {
    deps: OutputExecutorDeps;
    context: NodeExecutionContext;
    config: OutputConfig;
    issue: IssueOfItem;
}

export function createOutputExecutor(deps: OutputExecutorDeps): NodeExecutor {
    return async (context) => {
        const { config } = asNodeOfType(context.node, "output");
        const issue = issueOfItem(context);
        if (config.commentOnIssue && issue) {
            await commentOnIssueOncePerRun({ deps, context, config, issue });
        }

        return buildOutputResult(config);
    };
}

function issueOfItem({ item, project }: NodeExecutionContext): IssueOfItem | undefined {
    if (item?.number === undefined || project.githubRepo === undefined) {
        return undefined;
    }

    return { githubRepo: project.githubRepo, number: item.number, itemId: item.id };
}

// Retrying a NodeRun upstream runs the output again in the same run; the issue hears of it once.
async function commentOnIssueOncePerRun(request: IssueComment): Promise<void> {
    const { deps, context, config, issue } = request;
    const nodeRunsOfRun = await listNodeRunsOfItemInRun(deps.runs, context, issue.itemId);
    if (hasOutputSucceededBefore(nodeRunsOfRun, context)) {
        return;
    }

    const body = buildRunComment({
        runId: context.run.id,
        moveItemTo: config.moveItemTo,
        prUrl: await findPrUrlOfNodeRuns(deps.runs, nodeRunsOfRun),
        reason: findReason(context.inputs),
    });
    const github = await deps.githubOf(context.project.id);
    await github.comment(issue.githubRepo, issue.number, body);
}

async function listNodeRunsOfItemInRun(
    runs: RunRepository,
    context: NodeExecutionContext,
    itemId: string,
): Promise<NodeRunState[]> {
    const nodeRunsOfItem = await runs.listNodeRunsOfItem(itemId);
    return nodeRunsOfItem.filter((nodeRun) => nodeRun.runId === context.run.id);
}

function hasOutputSucceededBefore(
    nodeRunsOfRun: NodeRunState[],
    context: NodeExecutionContext,
): boolean {
    return nodeRunsOfRun.some(
        (nodeRun) =>
            nodeRun.nodeId === context.node.id &&
            nodeRun.id !== context.nodeRun.id &&
            nodeRun.status === "SUCCEEDED",
    );
}

async function findPrUrlOfNodeRuns(
    runs: RunRepository,
    nodeRuns: NodeRunState[],
): Promise<string | undefined> {
    const artifacts = await listArtifactsOfNodeRuns(runs, nodeRuns);
    return findPrUrl(artifacts);
}

// A review that sends the item to a human usually explains itself in `notes` (or `reason`).
function findReason(inputs: Record<string, unknown>): string | undefined {
    for (const input of Object.values(inputs)) {
        const reason = reasonFieldOf(input);
        if (reason !== undefined) {
            return reason;
        }
    }

    return undefined;
}

function reasonFieldOf(input: unknown): string | undefined {
    const parsed = explainedInputSchema.safeParse(input);
    if (!parsed.success) {
        return undefined;
    }

    return parsed.data.reason ?? parsed.data.notes;
}

function buildOutputResult(config: OutputConfig): NodeExecutionResult {
    return {
        outputs: {},
        artifacts: [
            { name: ITEM_OUTCOME_ARTIFACT, kind: "json", value: { moveItemTo: config.moveItemTo } },
        ],
    };
}
