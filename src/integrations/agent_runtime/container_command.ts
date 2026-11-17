import type { AgentContainer } from "@/integrations/agent_runtime/agent_container.js";
import type { ExecOptions, ExecResult } from "@/integrations/agent_runtime/agent_runtime.js";
import { workdirInContainer } from "@/integrations/agent_runtime/workspace_layout.js";

type CommandContainer = Pick<AgentContainer, "containerId" | "containers" | "env">;

const DEFAULT_SHELL = "sh";

/** Runs a shell command in the container, with the options of `Workspace.exec`. */
export async function execInContainer(
    container: CommandContainer,
    command: string,
    options: ExecOptions,
): Promise<ExecResult> {
    const shell = options.shell ?? DEFAULT_SHELL;
    const result = await container.containers.exec(container.containerId, [shell, "-c", command], {
        env: { ...container.env, ...options.env },
        workdir: workdirInContainer(options.cwd),
        timeoutMs: options.timeoutMs,
        signal: options.signal,
        onStdoutLine: options.onOutput,
        onStderrLine: options.onOutput,
    });

    return {
        exitCode: result.exitCode,
        stdoutTail: result.stdoutTail,
        stderrTail: result.stderrTail,
    };
}
