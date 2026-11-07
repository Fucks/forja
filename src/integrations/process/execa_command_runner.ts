import { execa } from "execa";

import type {
    CommandOptions,
    CommandResult,
    CommandRunner,
} from "@/integrations/process/command_runner.js";

// execa leaves exitCode undefined when the process never ran or was killed (timeout, abort).
const NO_EXIT_CODE = -1;

export class ExecaCommandRunner implements CommandRunner {
    async run(command: string, args: string[], options: CommandOptions): Promise<CommandResult> {
        const result = await execa(command, args, {
            cwd: options.cwd,
            env: options.env,
            input: options.input,
            timeout: options.timeoutMs,
            cancelSignal: options.signal,
            reject: false,
            windowsHide: true,
            stripFinalNewline: true,
        });

        return {
            exitCode: result.exitCode ?? NO_EXIT_CODE,
            stdout: result.stdout,
            stderr: result.stderr,
            timedOut: result.timedOut,
        };
    }
}
