export interface CommandResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
}

export type LineListener = (line: string) => void;

export interface CommandOptions {
    cwd?: string;
    env?: Record<string, string>;
    timeoutMs: number;
    input?: string;
    signal?: AbortSignal;
    onStdoutLine?: LineListener;
    onStderrLine?: LineListener;
}

export interface CommandRunner {
    run(command: string, args: string[], options: CommandOptions): Promise<CommandResult>;
}

export function commandSucceeded(result: CommandResult): boolean {
    return result.exitCode === 0 && !result.timedOut;
}
