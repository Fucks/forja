export interface AgentStartLimits {
    maxConcurrentAgents: number;
    minStartIntervalMs: number;
}

// Enforces the global ceiling of running agents and the minimum interval between agent starts.
export class AgentStartPacer {
    constructor(
        private readonly limits: AgentStartLimits,
        private lastStartAt: Date | undefined,
    ) {}

    get lastAgentStartAt(): Date | undefined {
        return this.lastStartAt;
    }

    canStart(now: Date, runningAgentCount: number): boolean {
        if (runningAgentCount >= this.limits.maxConcurrentAgents) {
            return false;
        }

        return now.getTime() >= this.nextStartAllowedAtMs();
    }

    recordStart(now: Date): void {
        this.lastStartAt = now;
    }

    // Undefined when only a free slot (not the clock) can let the next agent start.
    findNextStartTime(now: Date): Date | undefined {
        const nextStartAtMs = this.nextStartAllowedAtMs();
        if (nextStartAtMs <= now.getTime()) {
            return undefined;
        }

        return new Date(nextStartAtMs);
    }

    private nextStartAllowedAtMs(): number {
        if (!this.lastStartAt) {
            return Number.NEGATIVE_INFINITY;
        }

        return this.lastStartAt.getTime() + this.limits.minStartIntervalMs;
    }
}
