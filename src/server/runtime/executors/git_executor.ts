import { buildAgentEnv } from "@/integrations/agent_runtime/agent_env.js";
import { AgentRuntimeError } from "@/integrations/agent_runtime/agent_errors.js";
import type { GitProvider } from "@/integrations/git/git_provider.js";
import type {
    CreatePullRequestInput,
    GitHubProvider,
} from "@/integrations/github/github_provider.js";
import { assertNever } from "@/lib/assert_never.js";
import { rebaseItemBranch, remoteRefOf } from "@/server/runtime/executors/git_rebase.js";
import { asNodeOfType } from "@/server/runtime/executors/node_of_type.js";
import { prTitle } from "@/server/runtime/executors/pr_title.js";
import { buildPullRequestBody } from "@/server/runtime/executors/pull_request_body.js";
import type {
    NodeArtifact,
    NodeExecutionContext,
    NodeExecutionResult,
    NodeExecutor,
} from "@/server/runtime/node_executors.js";
import type { GithubOfProject } from "@/server/work_items/project_github_provider.js";
import { lookUpPath } from "@/shared/conditions.js";
import type { GitConfig } from "@/shared/node_configs/git_config.js";
import type { Project } from "@/shared/project_types.js";
import type { WorkItemSnapshot } from "@/shared/work_item_types.js";

const GIT_RESULT_PORT = "result";

export interface GitExecutorDeps {
    git: GitProvider;
    githubOf: GithubOfProject;
}

interface GitResult {
    branch: string;
    prUrl?: string;
    pushed: boolean;
}

interface BranchTarget {
    item: WorkItemSnapshot;
    branch: string;
    baseBranch: string;
}

interface OpenPullRequestInput {
    deps: GitExecutorDeps;
    context: NodeExecutionContext;
    config: GitConfig;
    target: BranchTarget;
}

export class GitNodeWithoutItemError extends AgentRuntimeError {
    constructor() {
        super("O nó git precisa de um item de trabalho");
        this.name = "GitNodeWithoutItemError";
    }
}

export class ProjectWithoutGithubRepoError extends AgentRuntimeError {
    constructor() {
        super("O projeto não tem um repositório no GitHub para abrir o PR");
        this.name = "ProjectWithoutGithubRepoError";
    }
}

export function createGitExecutor(deps: GitExecutorDeps): NodeExecutor {
    return async (context) => {
        const node = asNodeOfType(context.node, "git");
        const target = branchTargetOf(context, node.config);
        const { action } = node.config;
        switch (action) {
            case "rebase":
                return {
                    ...buildGitResult({ branch: target.branch, pushed: false }),
                    usage: await rebaseItemBranch(context, node, target.baseBranch),
                };
            case "push":
                return buildGitResult({
                    branch: target.branch,
                    pushed: await pushBranchIfAhead(deps.git, context, target),
                });
            case "open_pr":
                return buildGitResult(
                    await openPullRequest({ deps, context, config: node.config, target }),
                );
            default:
                return assertNever(action);
        }
    };
}

function branchTargetOf(context: NodeExecutionContext, config: GitConfig): BranchTarget {
    const { item } = context;
    if (!item) {
        throw new GitNodeWithoutItemError();
    }

    return {
        item,
        branch: item.branch,
        baseBranch: config.baseBranch ?? context.project.baseBranch,
    };
}

async function pushBranchIfAhead(
    git: GitProvider,
    context: NodeExecutionContext,
    target: BranchTarget,
): Promise<boolean> {
    if (!(await hasCommitsAhead(git, context, target))) {
        return false;
    }

    await pushBranch(git, context, target.branch);
    return true;
}

// Without commits ahead of the base there is nothing to review, so the branch stays local and a
// project without a GitHub repository can still finish the item.
async function openPullRequest({
    deps,
    context,
    config,
    target,
}: OpenPullRequestInput): Promise<GitResult> {
    if (!(await hasCommitsAhead(deps.git, context, target))) {
        return { branch: target.branch, pushed: false };
    }

    const repo = githubRepoOf(context.project);
    await pushBranch(deps.git, context, target.branch);
    const github = await deps.githubOf(context.project.id);
    const prUrl = await reuseOrCreatePullRequest(github, repo, {
        head: target.branch,
        base: target.baseBranch,
        title: prTitle(target.item),
        body: buildPullRequestBody(target.item, summaryFromInputs(context.inputs, config)),
        draft: config.draft,
    });

    return { branch: target.branch, prUrl, pushed: true };
}

async function hasCommitsAhead(
    git: GitProvider,
    context: NodeExecutionContext,
    target: BranchTarget,
): Promise<boolean> {
    const { ahead } = await git.aheadBehind(
        context.project.repoPath,
        target.branch,
        remoteRefOf(target.baseBranch),
    );

    return ahead > 0;
}

async function pushBranch(
    git: GitProvider,
    context: NodeExecutionContext,
    branch: string,
): Promise<void> {
    const env = buildAgentEnv({ github: context.credentials.githubToken, extra: {} });
    await git.push(context.project.repoPath, branch, env);
}

function githubRepoOf(project: Project): string {
    if (project.githubRepo === undefined) {
        throw new ProjectWithoutGithubRepoError();
    }

    return project.githubRepo;
}

function summaryFromInputs(inputs: Record<string, unknown>, config: GitConfig): string | undefined {
    if (config.bodyFrom === undefined) {
        return undefined;
    }

    const body = lookUpPath(inputs, config.bodyFrom);
    if (!body.isFound || typeof body.value !== "string" || body.value.trim() === "") {
        return undefined;
    }

    return body.value;
}

// Running the flow again for the same branch must not open a second pull request.
async function reuseOrCreatePullRequest(
    github: GitHubProvider,
    repo: string,
    pullRequest: CreatePullRequestInput,
): Promise<string> {
    const existing = await github.findPullRequestByHead(repo, pullRequest.head);
    if (existing?.state === "open") {
        await github.comment(repo, existing.number, pullRequest.body);
        return existing.url;
    }

    const created = await github.createPullRequest(repo, pullRequest);
    return created.url;
}

function buildGitResult(result: GitResult): NodeExecutionResult {
    const artifacts: NodeArtifact[] = [{ name: "branch", kind: "branch", value: result.branch }];
    if (result.prUrl !== undefined) {
        artifacts.push({ name: "pr_url", kind: "pr_url", value: result.prUrl });
    }

    return { outputs: { [GIT_RESULT_PORT]: result }, artifacts };
}
