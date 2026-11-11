// When each waiting gate gives up on its approval, kept as ISO dates so the snapshot can hold them.
export class ApprovalDeadlines {
    private readonly expiresAtByNodeRunId: Map<string, string>;

    constructor(saved: Record<string, string>) {
        this.expiresAtByNodeRunId = new Map(Object.entries(saved));
    }

    set(nodeRunId: string, expiresAt: Date): void {
        this.expiresAtByNodeRunId.set(nodeRunId, expiresAt.toISOString());
    }

    forget(nodeRunId: string): void {
        this.expiresAtByNodeRunId.delete(nodeRunId);
    }

    overdueNodeRunIds(now: Date): string[] {
        return [...this.expiresAtByNodeRunId.entries()]
            .filter(([, expiresAt]) => new Date(expiresAt).getTime() <= now.getTime())
            .map(([nodeRunId]) => nodeRunId);
    }

    toRecord(): Record<string, string> {
        return Object.fromEntries(this.expiresAtByNodeRunId);
    }
}
