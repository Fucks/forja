import { commandSucceeded, type CommandResult } from "@/integrations/process/command_runner.js";

export type AgentTimeoutKind = "total" | "idle";

export class UsageLimitError extends Error {
    constructor(readonly resetAt?: Date) {
        super("Limite de uso do agente atingido");
        this.name = "UsageLimitError";
    }
}

const TIMEOUT_MESSAGES: Record<AgentTimeoutKind, string> = {
    total: "O agente excedeu o tempo máximo de execução",
    idle: "O agente ficou tempo demais sem atividade",
};

export class AgentTimeoutError extends Error {
    constructor(readonly kind: AgentTimeoutKind) {
        super(TIMEOUT_MESSAGES[kind]);
        this.name = "AgentTimeoutError";
    }
}

export class StructuredOutputError extends Error {
    constructor(readonly raw?: string) {
        super("A saída do agente não segue o schema esperado");
        this.name = "StructuredOutputError";
    }
}

export class AgentCanceledError extends Error {
    constructor() {
        super("Execução do agente cancelada");
        this.name = "AgentCanceledError";
    }
}

/** Docker unavailable, missing image or a failed setup command. */
export class WorkspaceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "WorkspaceError";
    }
}

export function assertCommandSucceeded(result: CommandResult, failureMessage: string): void {
    if (!commandSucceeded(result)) {
        throw new WorkspaceError(`${failureMessage}: ${result.stderr.trim()}`);
    }
}

/** Any other agent failure. */
export class AgentRuntimeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AgentRuntimeError";
    }
}
