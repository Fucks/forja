import { buildAgentEnv, type ClaudeCredential } from "@/integrations/agent_runtime/agent_env.js";
import type {
    AgentRunHooks,
    AgentRunRequest,
    AgentRuntime,
    HeadlessSpec,
} from "@/integrations/agent_runtime/agent_runtime.js";
import { commandSucceeded, type CommandRunner } from "@/integrations/process/command_runner.js";
import { assertNever } from "@/lib/assert_never.js";
import type { Clock } from "@/lib/clock.js";
import type {
    CredentialService,
    RuntimeCredential,
} from "@/server/credentials/credential_service.js";
import { DomainValidationError } from "@/server/errors.js";
import { mapAgentError } from "@/server/runtime/error_mapping.js";
import type { Effort, PermissionMode } from "@/shared/agent_types.js";
import type { CredentialCheckResult } from "@/shared/credential_types.js";

/** Where the Claude check runs: an empty directory mounted as the repository, in the agent image. */
export interface CredentialCheckSandbox {
    repoPath: string;
    image: string;
}

export interface CredentialCheckDeps {
    credentials: CredentialService;
    runtime: AgentRuntime;
    commands: CommandRunner;
    clock: Clock;
    sandbox: CredentialCheckSandbox;
}

const CHECK_PROMPT = "Responda apenas OK";
const CHECK_MODEL = "haiku";
const CHECK_EFFORT: Effort = "low";
const CHECK_PERMISSION_MODE: PermissionMode = "default";
// The sandbox is not a git repository, so there is no branch to start from.
const NO_BASE_BRANCH = "";
const CHECK_MAX_ITERATIONS = 1;
const CHECK_TIMEOUT_MS = 2 * 60_000;
const MS_PER_SECOND = 1_000;
const CHECK_ID_PREFIX = "check_";
const CHECK_PROJECT_ID = "credential_check";
const GH_AUTH_STATUS_ARGS = ["auth", "status"];
const GH_TIMEOUT_MS = 30_000;
const VALID_CREDENTIAL: CredentialCheckResult = { ok: true, message: "Credencial válida" };
const GH_REJECTED_MESSAGE = "O gh não aceitou o token";
const GENERIC_CREDENTIAL_MESSAGE = "Credenciais genéricas não podem ser testadas.";
const IGNORED_AGENT_EVENTS: AgentRunHooks = { onEvent: () => undefined };

/** @throws NotFoundError, DomainValidationError for a generic_env credential */
export async function checkCredential(
    id: string,
    deps: CredentialCheckDeps,
): Promise<CredentialCheckResult> {
    const credential = await deps.credentials.revealForRuntime(id);
    const result = await runCheckOf(credential, deps);
    await deps.credentials.recordCheck(id, result.ok, deps.clock.now());

    return result;
}

function runCheckOf(
    { kind, value }: RuntimeCredential,
    deps: CredentialCheckDeps,
): Promise<CredentialCheckResult> {
    switch (kind) {
        case "anthropic_api_key":
        case "claude_oauth_token":
            return checkClaudeCredential({ kind, value }, deps);
        case "github_token":
            return checkGithubToken(value, deps.commands);
        case "generic_env":
            throw new DomainValidationError(GENERIC_CREDENTIAL_MESSAGE);
        default:
            return assertNever(kind);
    }
}

async function checkClaudeCredential(
    claude: ClaudeCredential,
    deps: CredentialCheckDeps,
): Promise<CredentialCheckResult> {
    const checkId = `${CHECK_ID_PREFIX}${deps.clock.now().getTime()}`;
    try {
        await deps.runtime.runHeadless(
            buildCheckSpec(checkId, deps.sandbox),
            buildCheckRequest(checkId, claude),
            IGNORED_AGENT_EVENTS,
        );
        return VALID_CREDENTIAL;
    } catch (error) {
        return { ok: false, message: mapAgentError(error).message };
    }
}

function buildCheckSpec(checkId: string, sandbox: CredentialCheckSandbox): HeadlessSpec {
    return {
        projectId: CHECK_PROJECT_ID,
        runId: checkId,
        repoPath: sandbox.repoPath,
        baseBranch: NO_BASE_BRANCH,
        image: sandbox.image,
        env: {},
        setupCommands: [],
    };
}

function buildCheckRequest(checkId: string, claude: ClaudeCredential): AgentRunRequest {
    return {
        nodeRunId: checkId,
        prompt: CHECK_PROMPT,
        model: CHECK_MODEL,
        effort: CHECK_EFFORT,
        maxIterations: CHECK_MAX_ITERATIONS,
        idleTimeoutSeconds: CHECK_TIMEOUT_MS / MS_PER_SECOND,
        timeoutMs: CHECK_TIMEOUT_MS,
        permissionMode: CHECK_PERMISSION_MODE,
        toolArgs: [],
        runtimeFiles: [],
        expandPromptCommands: false,
        env: buildAgentEnv({ claude, extra: {} }),
        signal: new AbortController().signal,
    };
}

// The token goes only in the env: `gh` reads GH_TOKEN before the host's own login.
async function checkGithubToken(
    token: string,
    commands: CommandRunner,
): Promise<CredentialCheckResult> {
    const result = await commands.run("gh", GH_AUTH_STATUS_ARGS, {
        env: buildAgentEnv({ github: token, extra: {} }),
        timeoutMs: GH_TIMEOUT_MS,
    });
    if (commandSucceeded(result)) {
        return VALID_CREDENTIAL;
    }

    const output = result.stderr.trim();
    return { ok: false, message: output === "" ? GH_REJECTED_MESSAGE : output };
}
