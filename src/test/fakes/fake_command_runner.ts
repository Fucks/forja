import type {
    CommandOptions,
    CommandResult,
    CommandRunner,
} from "@/integrations/process/command_runner.js";

export interface RecordedCommand {
    command: string;
    args: string[];
    options: CommandOptions;
}

interface ScriptedCommand {
    command: string;
    args: string[];
    result: CommandResult;
}

const UNSCRIPTED_COMMAND_EXIT_CODE = 127;

export class FakeCommandRunner implements CommandRunner {
    readonly calls: RecordedCommand[] = [];
    private scriptedCommands: ScriptedCommand[] = [];

    when(command: string, args: string[]): { returns(result: Partial<CommandResult>): void } {
        return {
            returns: (result) => {
                const scripted = { command, args, result: buildCommandResult(result) };
                this.scriptedCommands = [scripted, ...this.scriptedCommands];
            },
        };
    }

    run(command: string, args: string[], options: CommandOptions): Promise<CommandResult> {
        this.calls.push({ command, args, options });
        const scripted = this.scriptedCommands.find(
            (candidate) => candidate.command === command && haveSameArgs(candidate.args, args),
        );

        return Promise.resolve(scripted?.result ?? buildUnscriptedResult(command, args));
    }
}

export function buildCommandResult(overrides: Partial<CommandResult> = {}): CommandResult {
    return { exitCode: 0, stdout: "", stderr: "", timedOut: false, ...overrides };
}

function buildUnscriptedResult(command: string, args: string[]): CommandResult {
    return buildCommandResult({
        exitCode: UNSCRIPTED_COMMAND_EXIT_CODE,
        stderr: `FakeCommandRunner: no script for ${[command, ...args].join(" ")}`,
    });
}

function haveSameArgs(expected: string[], actual: string[]): boolean {
    return (
        expected.length === actual.length &&
        expected.every((argument, index) => argument === actual[index])
    );
}
