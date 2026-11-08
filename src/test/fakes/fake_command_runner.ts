import type {
    CommandOptions,
    CommandResult,
    CommandRunner,
    LineListener,
} from "@/integrations/process/command_runner.js";

export interface RecordedCommand {
    command: string;
    args: string[];
    options: CommandOptions;
}

export type ArgsMatcher = string[] | ((args: string[]) => boolean);

interface ScriptedCommand {
    command: string;
    args: ArgsMatcher;
    result: CommandResult;
}

const UNSCRIPTED_COMMAND_EXIT_CODE = 127;

export class FakeCommandRunner implements CommandRunner {
    readonly calls: RecordedCommand[] = [];
    private scriptedCommands: ScriptedCommand[] = [];

    when(command: string, args: ArgsMatcher): { returns(result: Partial<CommandResult>): void } {
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
            (candidate) => candidate.command === command && argsMatch(candidate.args, args),
        );

        const result = scripted?.result ?? buildUnscriptedResult(command, args);
        replayLines(result.stdout, options.onStdoutLine);
        replayLines(result.stderr, options.onStderrLine);

        return Promise.resolve(result);
    }
}

function replayLines(output: string, listener: LineListener | undefined): void {
    if (!listener || output === "") {
        return;
    }

    output.split("\n").forEach((line) => listener(line));
}

function buildCommandResult(overrides: Partial<CommandResult> = {}): CommandResult {
    return { exitCode: 0, stdout: "", stderr: "", timedOut: false, ...overrides };
}

function buildUnscriptedResult(command: string, args: string[]): CommandResult {
    return buildCommandResult({
        exitCode: UNSCRIPTED_COMMAND_EXIT_CODE,
        stderr: `FakeCommandRunner: no script for ${[command, ...args].join(" ")}`,
    });
}

function argsMatch(matcher: ArgsMatcher, args: string[]): boolean {
    if (typeof matcher === "function") {
        return matcher(args);
    }

    return haveSameArgs(matcher, args);
}

function haveSameArgs(expected: string[], actual: string[]): boolean {
    return (
        expected.length === actual.length &&
        expected.every((argument, index) => argument === actual[index])
    );
}
