import type { z } from "zod";

import { parseBlockedBy } from "@/integrations/github/blocked_by_parser.js";
import {
    GH_ISSUE_FIELDS,
    GH_PULL_REQUEST_FIELDS,
    ghIssueSchema,
    ghPullRequestSchema,
    toGithubIssue,
    toGithubPullRequest,
} from "@/integrations/github/gh_json.js";
import type { GhIssue } from "@/integrations/github/gh_json.js";
import { GitHubError } from "@/integrations/github/github_provider.js";
import type {
    CreatePullRequestInput,
    GithubIssue,
    GitHubProvider,
    ListIssuesOptions,
} from "@/integrations/github/github_provider.js";
import { commandSucceeded } from "@/integrations/process/command_runner.js";
import type { CommandResult, CommandRunner } from "@/integrations/process/command_runner.js";

const GH_TIMEOUT_MS = 30_000;
const BODY_FROM_STDIN = ["--body-file", "-"];
const NOT_FOUND_MARKER = "HTTP 404";
const LINE_BREAK = /\r?\n/;

export interface GhCliGitHubProviderDeps {
    commands: CommandRunner;
    /** Extra environment for `gh`, such as an optional GH_TOKEN. */
    env: Record<string, string>;
}

interface GhInvocation {
    args: string[];
    input?: string;
}

export function createGhCliGitHubProvider(deps: GhCliGitHubProviderDeps): GitHubProvider {
    const gh = createGhRunner(deps);

    async function withDependencies(repo: string, ghIssue: GhIssue): Promise<GithubIssue> {
        const nativeNumbers = await readNativeBlockedBy(gh, repo, ghIssue.number);
        const blockedByNumbers = [...new Set([...parseBlockedBy(ghIssue.body), ...nativeNumbers])];
        return toGithubIssue(ghIssue, blockedByNumbers);
    }

    return {
        async listIssues(repo, opts) {
            const ghIssues = await gh.json(listIssuesArgs(repo, opts), ghIssueSchema.array());
            return Promise.all(ghIssues.map((ghIssue) => withDependencies(repo, ghIssue)));
        },

        async getIssue(repo, number) {
            const args = ["issue", "view", String(number), "--repo", repo];
            const ghIssue = await gh.json([...args, "--json", GH_ISSUE_FIELDS], ghIssueSchema);
            return withDependencies(repo, ghIssue);
        },

        async comment(repo, number, body) {
            const args = ["issue", "comment", String(number), "--repo", repo, ...BODY_FROM_STDIN];
            await gh.text({ args, input: body });
        },

        async closeIssue(repo, number) {
            await gh.text({ args: ["issue", "close", String(number), "--repo", repo] });
        },

        async createPullRequest(repo, input) {
            const createOutput = await gh.text({
                args: createPullRequestArgs(repo, input),
                input: input.body,
            });
            const url = lastLineOf(createOutput);
            const args = ["pr", "view", url, "--json", GH_PULL_REQUEST_FIELDS];
            return toGithubPullRequest(await gh.json(args, ghPullRequestSchema));
        },

        async findPullRequestByHead(repo, head) {
            const args = ["pr", "list", "--repo", repo, "--head", head, "--state", "all"];
            const pullRequests = await gh.json(
                [...args, "--json", GH_PULL_REQUEST_FIELDS],
                ghPullRequestSchema.array(),
            );
            const [latest] = pullRequests;
            if (!latest) {
                return undefined;
            }

            return toGithubPullRequest(latest);
        },
    };
}

function listIssuesArgs(repo: string, opts: ListIssuesOptions): string[] {
    const args = ["issue", "list", "--repo", repo, "--state", opts.state];
    const fields = ["--limit", String(opts.limit), "--json", GH_ISSUE_FIELDS];
    const labelFilter = opts.label === undefined ? [] : ["--label", opts.label];
    return [...args, ...fields, ...labelFilter];
}

function createPullRequestArgs(repo: string, input: CreatePullRequestInput): string[] {
    const args = ["pr", "create", "--repo", repo, "--head", input.head, "--base", input.base];
    const draftFlag = input.draft ? ["--draft"] : [];
    return [...args, "--title", input.title, ...BODY_FROM_STDIN, ...draftFlag];
}

type GhRunner = ReturnType<typeof createGhRunner>;

function createGhRunner({ commands, env }: GhCliGitHubProviderDeps) {
    function run({ args, input }: GhInvocation): Promise<CommandResult> {
        return commands.run("gh", args, { env, input, timeoutMs: GH_TIMEOUT_MS });
    }

    async function text(invocation: GhInvocation): Promise<string> {
        const result = await run(invocation);
        assertGhSucceeded(result, invocation.args);
        return result.stdout;
    }

    async function json<Schema extends z.ZodType>(
        args: string[],
        schema: Schema,
    ): Promise<z.infer<Schema>> {
        const result = await run({ args });
        assertGhSucceeded(result, args);
        const parsed = schema.safeParse(parseJsonOrUndefined(result.stdout));
        if (!parsed.success) {
            throw new GitHubError(`Resposta inesperada de ${describeGh(args)}`, result.stderr);
        }

        return parsed.data;
    }

    return { run, text, json };
}

async function readNativeBlockedBy(
    gh: GhRunner,
    repo: string,
    issueNumber: number,
): Promise<number[]> {
    const endpoint = `repos/${repo}/issues/${issueNumber}/dependencies/blocked_by`;
    const args = ["api", endpoint, "--jq", ".[].number"];
    const result = await gh.run({ args });
    if (isNotFound(result)) {
        return [];
    }

    assertGhSucceeded(result, args);
    return result.stdout
        .split(LINE_BREAK)
        .filter((line) => line.trim() !== "")
        .map(Number);
}

// Repositories without native issue dependencies answer 404; the body section still applies.
function isNotFound(result: CommandResult): boolean {
    return !commandSucceeded(result) && result.stderr.includes(NOT_FOUND_MARKER);
}

function assertGhSucceeded(result: CommandResult, args: string[]): void {
    if (!commandSucceeded(result)) {
        throw new GitHubError(`Falha ao executar ${describeGh(args)}`, result.stderr.trim());
    }
}

function parseJsonOrUndefined(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

function lastLineOf(text: string): string {
    const lines = text.trim().split(LINE_BREAK);
    return lines.at(-1)?.trim() ?? "";
}

function describeGh(args: string[]): string {
    const [group, action] = args;
    return `gh ${group ?? ""} ${action ?? ""}`.trim();
}
