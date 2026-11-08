import { randomUUID } from "node:crypto";

import {
    AgentCanceledError,
    AgentTimeoutError,
    assertCommandSucceeded,
} from "@/integrations/agent_runtime/agent_errors.js";
import type {
    CommandResult,
    CommandRunner,
    LineListener,
} from "@/integrations/process/command_runner.js";

export interface ContainerMount {
    host: string;
    container: string;
    readOnly?: boolean;
}

export interface StartContainerInput {
    name: string;
    image: string;
    mounts: ContainerMount[];
    labels: Record<string, string>;
    workdir: string;
    user?: string;
    network?: string;
}

export interface ContainerExecOptions {
    env: Record<string, string>;
    stdin?: string;
    timeoutMs: number;
    signal: AbortSignal;
    onStdoutLine?: LineListener;
    onStderrLine?: LineListener;
}

export interface ContainerExecResult {
    exitCode: number;
    stdoutTail: string;
    stderrTail: string;
}

export interface ContainerSummary {
    id: string;
    labels: Record<string, string>;
}

/** The only place that builds `docker` arguments. */
export interface ContainerManager {
    start(input: StartContainerInput): Promise<{ id: string }>;
    exec(
        id: string,
        command: string[],
        options: ContainerExecOptions,
    ): Promise<ContainerExecResult>;
    /** Idempotent: removing a container that no longer exists succeeds. */
    stop(id: string): Promise<void>;
    /** An empty label value matches every container that has the label. */
    list(labels: Record<string, string>): Promise<ContainerSummary[]>;
}

export type NewExecId = () => string;

interface FinishedExec {
    id: string;
    execId: string;
    result: CommandResult;
    signal: AbortSignal;
}

const EXEC_ID_VARIABLE = "FORJA_EXEC_ID";
const OUTPUT_TAIL_CHARS = 4_000;
const DOCKER_RUN_TIMEOUT_MS = 600_000;
const DOCKER_COMMAND_TIMEOUT_MS = 30_000;
const NO_SUCH_CONTAINER_MESSAGE = "No such container";
const LIST_FORMAT = "{{.ID}}\t{{.Labels}}";
const LABEL_SEPARATOR = ",";
const KEY_VALUE_SEPARATOR = "=";

// `docker exec` does not stop the process in the container when the host client dies, so each
// exec is killed with `pkill -f -- <marker>`. The marker sits in the argv of this `sh` wrapper
// (as $0), which runs the command in the background — keeping stdin through fd 3, since a
// background job would otherwise read /dev/null — and forwards SIGTERM to it. Images without
// `pkill` (procps) cannot be canceled from inside: the process runs until it exits by itself.
const FORWARD_TERM_TO_COMMAND_SCRIPT =
    'exec 3<&0; "$@" <&3 3<&- & child=$!; trap \'kill -TERM "$child"\' TERM; wait "$child"';

export function createContainerManager(
    commands: CommandRunner,
    newExecId: NewExecId = randomUUID,
): ContainerManager {
    function runDocker(args: string[], timeoutMs = DOCKER_COMMAND_TIMEOUT_MS) {
        return commands.run("docker", args, { timeoutMs });
    }

    async function killInContainer(id: string, execId: string): Promise<void> {
        // Best effort: exit code 1 only means the process had already finished.
        await runDocker(["exec", id, "pkill", "-f", "--", execId]);
    }

    async function throwIfInterrupted(execution: FinishedExec): Promise<void> {
        const { id, execId, result, signal } = execution;
        if (signal.aborted) {
            await killInContainer(id, execId);
            throw new AgentCanceledError();
        }
        if (result.timedOut) {
            await killInContainer(id, execId);
            throw new AgentTimeoutError("total");
        }
    }

    return {
        async start(input) {
            const result = await runDocker(buildRunArgs(input), DOCKER_RUN_TIMEOUT_MS);
            assertCommandSucceeded(result, `Não foi possível iniciar o container ${input.name}`);

            return { id: result.stdout.trim() };
        },

        async exec(id, command, options) {
            const execId = newExecId();
            const result = await commands.run(
                "docker",
                buildExecArgs({ id, command, execId, options }),
                {
                    env: { ...options.env, [EXEC_ID_VARIABLE]: execId },
                    input: options.stdin,
                    timeoutMs: options.timeoutMs,
                    signal: options.signal,
                    onStdoutLine: options.onStdoutLine,
                    onStderrLine: options.onStderrLine,
                },
            );

            await throwIfInterrupted({ id, execId, result, signal: options.signal });

            return {
                exitCode: result.exitCode,
                stdoutTail: keepTail(result.stdout),
                stderrTail: keepTail(result.stderr),
            };
        },

        async stop(id) {
            const result = await runDocker(["rm", "-f", id]);
            if (result.stderr.includes(NO_SUCH_CONTAINER_MESSAGE)) {
                return;
            }

            assertCommandSucceeded(result, `Não foi possível remover o container ${id}`);
        },

        async list(labels) {
            const result = await runDocker([
                "ps",
                "-a",
                ...buildLabelFilters(labels),
                "--format",
                LIST_FORMAT,
            ]);
            assertCommandSucceeded(result, "Não foi possível listar os containers da Forja");

            return parseContainerList(result.stdout);
        },
    };
}

export function wrapWithExecMarker(command: string[], execId: string): string[] {
    return ["sh", "-c", FORWARD_TERM_TO_COMMAND_SCRIPT, execId, ...command];
}

function buildRunArgs(input: StartContainerInput): string[] {
    const labelArgs = Object.entries(input.labels).flatMap(([key, value]) => [
        "--label",
        `${key}${KEY_VALUE_SEPARATOR}${value}`,
    ]);
    const mountArgs = input.mounts.flatMap((mount) => ["-v", formatMount(mount)]);
    const userArgs = input.user ? ["--user", input.user] : [];
    const networkArgs = input.network ? ["--network", input.network] : [];

    return [
        "run",
        "-d",
        "--rm=false",
        "--name",
        input.name,
        ...labelArgs,
        ...mountArgs,
        "-w",
        input.workdir,
        ...userArgs,
        ...networkArgs,
        input.image,
        "sleep",
        "infinity",
    ];
}

function formatMount(mount: ContainerMount): string {
    const bind = `${mount.host}:${mount.container}`;
    return mount.readOnly ? `${bind}:ro` : bind;
}

interface ExecArgsInput {
    id: string;
    command: string[];
    execId: string;
    options: ContainerExecOptions;
}

// Secrets never reach argv: `-e NAME` without a value makes docker read it from its own environment.
function buildExecArgs({ id, command, execId, options }: ExecArgsInput): string[] {
    const stdinArgs = options.stdin === undefined ? [] : ["-i"];
    const envNames = new Set([EXEC_ID_VARIABLE, ...Object.keys(options.env)]);
    const envArgs = [...envNames].flatMap((name) => ["-e", name]);

    return ["exec", ...stdinArgs, ...envArgs, id, ...wrapWithExecMarker(command, execId)];
}

function buildLabelFilters(labels: Record<string, string>): string[] {
    return Object.entries(labels).flatMap(([key, value]) => {
        const label = value === "" ? key : `${key}${KEY_VALUE_SEPARATOR}${value}`;
        return ["--filter", `label=${label}`];
    });
}

function parseContainerList(output: string): ContainerSummary[] {
    return output
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => {
            const [id = "", labelsText = ""] = line.split("\t");
            return { id: id.trim(), labels: parseLabels(labelsText) };
        });
}

function parseLabels(labelsText: string): Record<string, string> {
    const pairs = labelsText
        .split(LABEL_SEPARATOR)
        .filter((pair) => pair.includes(KEY_VALUE_SEPARATOR))
        .map(splitLabelPair);

    return Object.fromEntries(pairs);
}

function splitLabelPair(pair: string): [string, string] {
    const separatorIndex = pair.indexOf(KEY_VALUE_SEPARATOR);
    return [pair.slice(0, separatorIndex), pair.slice(separatorIndex + 1)];
}

function keepTail(output: string): string {
    return output.slice(-OUTPUT_TAIL_CHARS);
}
