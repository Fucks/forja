export interface CommandResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
}

export interface CommandOptions {
    cwd?: string;
    env?: Record<string, string>;
    timeoutMs: number;
    input?: string;
    signal?: AbortSignal;
}

export interface CommandRunner {
    run(command: string, args: string[], options: CommandOptions): Promise<CommandResult>;
}
