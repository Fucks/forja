import type {
    AgentEvent,
    AgentRunHooks,
    ExecOptions,
    ExecResult,
} from "@/integrations/agent_runtime/agent_runtime.js";
import {
    createSecretRedactor,
    type SecretRedactor,
} from "@/integrations/secrets/secret_redactor.js";
import { assertNever } from "@/lib/assert_never.js";
import { acquireItemWorkspace } from "@/server/runtime/executors/item_workspace.js";
import { asNodeOfType } from "@/server/runtime/executors/node_of_type.js";
import {
    buildScriptEnvironment,
    renderCommand,
} from "@/server/runtime/executors/script_environment.js";
import { ScriptFailedError } from "@/server/runtime/executors/script_failed_error.js";
import {
    parseScriptOutput,
    type ScriptOutputParsing,
} from "@/server/runtime/executors/script_output.js";
import type { NodeExecutionContext, NodeExecutionResult } from "@/server/runtime/node_executors.js";
import { buildDataContext, buildHeadlessSpec } from "@/server/runtime/run_context.js";
import type { ScriptConfig, ScriptOutputMode } from "@/shared/node_configs/script_config.js";

export interface ScriptResult {
    exitCode: number;
    passed: boolean;
    /** The last 200 lines. */
    stdout: string;
    /** The last 200 lines. */
    stderr: string;
    durationMs: number;
    /** What `parseOutput` read from the stdout. */
    data?: unknown;
}

const MS_PER_MINUTE = 60_000;
const OUTPUT_MAX_LINES = 200;
const LINE_SEPARATOR = "\n";
const PASSING_EXIT_CODE = 0;
const INVALID_JSON_MESSAGE = "Saída não é JSON válido; `data` ficou vazio";

// A timeout, a cancellation or a workspace error fail the node whatever `onFailure` says.
export async function executeScriptNode(
    context: NodeExecutionContext,
): Promise<NodeExecutionResult> {
    const { config } = asNodeOfType(context.node, "script");
    const credentialMask = createCredentialMask(context, config);
    const command = renderCommand(config.command, buildDataContext(context));
    const env = await buildScriptEnvironment(context, config);

    const startedAt = context.clock.now().getTime();
    const execution = await runCommand(context, config, command, {
        env,
        cwd: config.workingDir,
        shell: config.shell,
        timeoutMs: config.timeoutMinutes * MS_PER_MINUTE,
        signal: context.signal,
        onOutput: (line) =>
            context.onAgentEvent(rawLineEvent(context, credentialMask.redact(line))),
    });
    const durationMs = context.clock.now().getTime() - startedAt;

    const result = buildScriptResult(context, config, { execution, durationMs, credentialMask });
    assertAllowedToFinish(result, config);

    return { outputs: { result, output: result.stdout } };
}

// The values never leave the executor unmasked, even when shorter than what the log store masks.
function createCredentialMask(context: NodeExecutionContext, config: ScriptConfig): SecretRedactor {
    const mask = createSecretRedactor();
    for (const envVar of config.env) {
        if (envVar.credentialId !== undefined) {
            mask.register(context.credentials.credentialValueOf(envVar.credentialId));
        }
    }

    return mask;
}

async function runCommand(
    context: NodeExecutionContext,
    config: ScriptConfig,
    command: string,
    options: ExecOptions,
): Promise<ExecResult> {
    const { runIn } = config;
    switch (runIn) {
        case "item":
            return runInItemWorkspace(context, command, options);
        case "isolated":
            return runInIsolatedContainer(context, config, command, options);
        default:
            return assertNever(runIn);
    }
}

async function runInItemWorkspace(
    context: NodeExecutionContext,
    command: string,
    options: ExecOptions,
): Promise<ExecResult> {
    const hooks: AgentRunHooks = { onEvent: (event) => context.onAgentEvent(event) };
    const workspace = await acquireItemWorkspace(context, hooks);

    return workspace.exec(command, options);
}

// An empty image means the project's agent image, like an agent with workspace "none".
function runInIsolatedContainer(
    context: NodeExecutionContext,
    config: ScriptConfig,
    command: string,
    options: ExecOptions,
): Promise<ExecResult> {
    const spec = buildHeadlessSpec(context, context.item);
    const image = config.image?.trim() || spec.image;

    return context.runtime.execHeadless({ ...spec, image }, command, options);
}

interface FinishedCommand {
    execution: ExecResult;
    durationMs: number;
    credentialMask: SecretRedactor;
}

function buildScriptResult(
    context: NodeExecutionContext,
    config: ScriptConfig,
    { execution, durationMs, credentialMask }: FinishedCommand,
): ScriptResult {
    const stdout = credentialMask.redact(keepLastLines(execution.stdoutTail));
    const result: ScriptResult = {
        exitCode: execution.exitCode,
        passed: execution.exitCode === PASSING_EXIT_CODE,
        stdout,
        stderr: credentialMask.redact(keepLastLines(execution.stderrTail)),
        durationMs,
    };

    const parsing = parseOutputReportingInvalidJson(context, stdout, config.parseOutput);
    if (parsing.kind !== "parsed") {
        return result;
    }

    return { ...result, data: parsing.data };
}

// Invalid JSON is the command's problem to show, not a reason to fail the node.
function parseOutputReportingInvalidJson(
    context: NodeExecutionContext,
    stdout: string,
    mode: ScriptOutputMode,
): ScriptOutputParsing {
    const parsing = parseScriptOutput(stdout, mode);
    if (parsing.kind === "invalid") {
        context.onAgentEvent(systemEvent(context, INVALID_JSON_MESSAGE));
    }

    return parsing;
}

function assertAllowedToFinish(result: ScriptResult, config: ScriptConfig): void {
    if (!result.passed && config.onFailure === "fail") {
        throw new ScriptFailedError(result.exitCode);
    }
}

function rawLineEvent(context: NodeExecutionContext, line: string): AgentEvent {
    return { kind: "raw", line, at: context.clock.now(), iteration: context.nodeRun.iteration };
}

function systemEvent(context: NodeExecutionContext, message: string): AgentEvent {
    return { kind: "system", message, at: context.clock.now() };
}

function keepLastLines(text: string): string {
    return text.split(LINE_SEPARATOR).slice(-OUTPUT_MAX_LINES).join(LINE_SEPARATOR);
}
