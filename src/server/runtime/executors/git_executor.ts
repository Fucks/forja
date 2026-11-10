import { buildAgentEnv } from "@/integrations/agent_runtime/agent_env.js";
import { AgentRuntimeError } from "@/integrations/agent_runtime/agent_errors.js";
import type {
    AgentRunHooks,
    ExecOptions,
    Workspace,
} from "@/integrations/agent_runtime/agent_runtime.js";
import type { GitProvider } from "@/integrations/git/git_provider.js";
import type {
    CreatePullRequestInput,
    GitHubProvider,
} from "@/integrations/github/github_provider.js";
import { assertNever } from "@/lib/assert_never.js";
import { quoteShellArgument } from "@/lib/shell_quote.js";
import { executeAgentNode } from "@/server/runtime/executors/agent_executor.js";
import { acquireItemWorkspace } from "@/server/runtime/executors/item_workspace.js";
import { asNodeOfType } from "@/server/runtime/executors/node_of_type.js";
import { prTitle } from "@/server/runtime/executors/pr_title.js";
import { buildPullRequestBody } from "@/server/runtime/executors/pull_request_body.js";
import { buildRebaserNode, type GitNode } from "@/server/runtime/executors/rebaser_node.js";
import type {
    NodeArtifact,
    NodeExecutionContext,
    NodeExecutionResult,
    NodeExecutor,
} from "@/server/runtime/node_executors.js";
import type { GithubOfProject } from "@/server/work_items/project_github_provider.js";
import type { GitConfig } from "@/shared/node_configs/git_config.js";
import type { Project } from "@/shared/project_types.js";
import type { WorkItemSnapshot } from "@/shared/work_item_types.js";

const GIT_RESULT_PORT = "result";
const REBASE_TIMEOUT_MS = 300_000;
const REMOTE = "origin";
const CONFLICTED_FILES_COMMAND = "git diff --name-only --diff-filter=U";
const REBASE_FINISHED_COMMAND =
    'test ! -d "$(git rev-parse --git-path rebase-merge)" && ' +
    'test ! -d "$(git rev-parse --git-path rebase-apply)"';
const LINE_BREAK = /\r?\n/;

export interface GitExecutorDeps {
    git: GitProvider;
    githubOf: GithubOfProject;
}

export interface GitResult {
    branch: string;
    prUrl?: string;
    pushed: boolean;
}

interface BranchTarget {
    item: WorkItemSnapshot;
    branch: string;
    baseBranch: string;
}

export class UnresolvedConflictsError extends AgentRuntimeError {
    constructor(conflictedFiles: string[]) {
        const fileList = conflictedFiles.length === 0 ? "" : `: ${conflictedFiles.join(", ")}`;
        super(`O rebase parou com conflitos não resolvidos${fileList}`);
        this.name = "UnresolvedConflictsError";
    }
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
                return rebaseOntoBase(context, node, target);
            case "push":
                return buildGitResult({
                    branch: target.branch,
                    pushed: await pushBranch(deps.git, context, target),
                });
            case "open_pr":
                return buildGitResult(await openPullRequest(deps, context, node.config, target));
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

async function rebaseOntoBase(
    context: NodeExecutionContext,
    node: GitNode,
    target: BranchTarget,
): Promise<NodeExecutionResult> {
    const workspace = await acquireItemWorkspace(context, agentHooksOf(context));
    const unchangedBranch = buildGitResult({ branch: target.branch, pushed: false });
    const rebase = await workspace.exec(rebaseCommand(target.baseBranch), execOptionsOf(context));
    if (rebase.exitCode === 0) {
        return unchangedBranch;
    }

    const resolution = await resolveConflictsWithAgent(context, node, target.baseBranch);
    await assertRebaseFinished(workspace, context);

    return { ...unchangedBranch, usage: resolution.usage };
}

function rebaseCommand(baseBranch: string): string {
    const fetch = `git fetch ${REMOTE} ${quoteShellArgument(baseBranch)}`;
    const rebase = `git rebase ${quoteShellArgument(remoteRefOf(baseBranch))}`;

    return `${fetch} && ${rebase}`;
}

// The prompt names the base of this node, which may not be the project's.
function resolveConflictsWithAgent(
    context: NodeExecutionContext,
    node: GitNode,
    baseBranch: string,
): Promise<NodeExecutionResult> {
    return executeAgentNode({
        ...context,
        node: buildRebaserNode(node),
        project: { ...context.project, baseBranch },
    });
}

async function assertRebaseFinished(
    workspace: Workspace,
    context: NodeExecutionContext,
): Promise<void> {
    const [conflictedFiles, rebaseFinished] = await Promise.all([
        workspace.exec(CONFLICTED_FILES_COMMAND, execOptionsOf(context)),
        workspace.exec(REBASE_FINISHED_COMMAND, execOptionsOf(context)),
    ]);
    const filesStillInConflict = linesOf(conflictedFiles.stdoutTail);
    if (filesStillInConflict.length > 0 || rebaseFinished.exitCode !== 0) {
        throw new UnresolvedConflictsError(filesStillInConflict);
    }
}

// Without commits ahead of the base there is nothing to review, so the branch stays local.
async function pushBranch(
    git: GitProvider,
    context: NodeExecutionContext,
    target: BranchTarget,
): Promise<boolean> {
    const { repoPath } = context.project;
    const { ahead } = await git.aheadBehind(
        repoPath,
        target.branch,
        remoteRefOf(target.baseBranch),
    );
    if (ahead === 0) {
        return false;
    }

    const env = buildAgentEnv({ github: context.credentials.githubToken, extra: {} });
    await git.push(repoPath, target.branch, env);
    return true;
}

async function openPullRequest(
    deps: GitExecutorDeps,
    context: NodeExecutionContext,
    config: GitConfig,
    target: BranchTarget,
): Promise<GitResult> {
    const repo = githubRepoOf(context.project);
    const pushed = await pushBranch(deps.git, context, target);
    if (!pushed) {
        return { branch: target.branch, pushed };
    }

    const github = await deps.githubOf(context.project.id);
    const prUrl = await reuseOrCreatePullRequest(github, repo, {
        head: target.branch,
        base: target.baseBranch,
        title: prTitle(target.item),
        body: buildPullRequestBody(target.item, bodyInputOf(context.inputs, config)),
        draft: config.draft,
    });

    return { branch: target.branch, prUrl, pushed };
}

function githubRepoOf(project: Project): string {
    if (project.githubRepo === undefined) {
        throw new ProjectWithoutGithubRepoError();
    }

    return project.githubRepo;
}

function bodyInputOf(inputs: Record<string, unknown>, config: GitConfig): string | undefined {
    if (config.bodyFrom === undefined) {
        return undefined;
    }

    const body = inputs[config.bodyFrom];
    return typeof body === "string" && body.trim() !== "" ? body : undefined;
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

function remoteRefOf(branch: string): string {
    return `${REMOTE}/${branch}`;
}

function agentHooksOf(context: NodeExecutionContext): AgentRunHooks {
    return { onEvent: (event) => context.onAgentEvent(event) };
}

function execOptionsOf(context: NodeExecutionContext): ExecOptions {
    return { timeoutMs: REBASE_TIMEOUT_MS, signal: context.signal };
}

function linesOf(text: string): string[] {
    return text.split(LINE_BREAK).filter((line) => line.trim() !== "");
}
