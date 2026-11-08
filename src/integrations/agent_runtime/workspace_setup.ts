import { AgentTimeoutError, WorkspaceError } from "@/integrations/agent_runtime/agent_errors.js";
import type { AgentRunHooks, SetupCommand } from "@/integrations/agent_runtime/agent_runtime.js";
import type {
    ContainerExecResult,
    ContainerManager,
} from "@/integrations/agent_runtime/container_manager.js";
import type { Clock } from "@/lib/clock.js";

export interface SetupInput {
    containers: ContainerManager;
    clock: Clock;
    containerId: string;
    setupCommands: SetupCommand[];
    env: Record<string, string>;
    hooks: AgentRunHooks;
    signal: AbortSignal;
}

/** Runs the commands in order, each output line becoming a `system` event. */
export async function runSetupCommands(input: SetupInput): Promise<void> {
    for (const setupCommand of input.setupCommands) {
        const result = await execSetupCommand(input, setupCommand);
        if (result.exitCode !== 0) {
            throw new WorkspaceError(describeFailure(setupCommand, result));
        }
    }
}

async function execSetupCommand(
    input: SetupInput,
    setupCommand: SetupCommand,
): Promise<ContainerExecResult> {
    const emitSystemEvent = (message: string): void =>
        input.hooks.onEvent({ kind: "system", message, at: input.clock.now() });

    try {
        return await input.containers.exec(input.containerId, ["sh", "-c", setupCommand.command], {
            env: input.env,
            timeoutMs: setupCommand.timeoutMs,
            signal: input.signal,
            onStdoutLine: emitSystemEvent,
            onStderrLine: emitSystemEvent,
        });
    } catch (error) {
        if (error instanceof AgentTimeoutError) {
            throw new WorkspaceError(
                `O comando de setup "${setupCommand.command}" excedeu o tempo`,
            );
        }
        throw error;
    }
}

function describeFailure(setupCommand: SetupCommand, result: ContainerExecResult): string {
    const outputTail = [result.stdoutTail, result.stderrTail]
        .filter((output) => output !== "")
        .join("\n");

    return `O comando de setup "${setupCommand.command}" falhou (código ${result.exitCode}): ${outputTail}`;
}
