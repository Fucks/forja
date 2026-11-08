import type {
    AgentRunHooks,
    AgentRuntime,
    Workspace,
    WorkspaceSpec,
} from "@/integrations/agent_runtime/agent_runtime.js";
import type { WorkItemSnapshot } from "@/shared/work_item_types.js";

// The NodeRun that opens the workspace receives its setup events and can abort the opening.
export interface WorkspaceOpening {
    hooks: AgentRunHooks;
    signal: AbortSignal;
}

export interface WorkspacePool {
    // Opens the workspace of the item on its first need; later calls share it.
    acquire(item: WorkItemSnapshot, opening: WorkspaceOpening): Promise<Workspace>;
    release(itemId: string): Promise<void>;
    releaseAll(): Promise<void>;
    hasWorkspace(itemId: string): boolean;
}

export interface WorkspacePoolDeps {
    runtime: AgentRuntime;
    specOf(item: WorkItemSnapshot): WorkspaceSpec;
}

export function createWorkspacePool(deps: WorkspacePoolDeps): WorkspacePool {
    return new ItemWorkspacePool(deps);
}

class ItemWorkspacePool implements WorkspacePool {
    // Keeping the pending opening is what makes concurrent acquisitions open only once.
    private readonly openings = new Map<string, Promise<Workspace>>();

    constructor(private readonly deps: WorkspacePoolDeps) {}

    acquire(item: WorkItemSnapshot, opening: WorkspaceOpening): Promise<Workspace> {
        const existing = this.openings.get(item.id);
        if (existing) {
            return existing;
        }

        const spec = this.deps.specOf(item);
        const workspace = this.deps.runtime.openWorkspace(spec, opening.hooks, opening.signal);
        this.openings.set(item.id, workspace);
        this.forgetWhenOpeningFails(item.id, workspace);

        return workspace;
    }

    async release(itemId: string): Promise<void> {
        const opening = this.openings.get(itemId);
        if (!opening) {
            return;
        }

        this.openings.delete(itemId);
        // The NodeRun that acquired a workspace whose opening failed already got the error.
        const workspace = await opening.catch(() => undefined);
        await workspace?.close();
    }

    async releaseAll(): Promise<void> {
        const itemIds = [...this.openings.keys()];
        await Promise.all(itemIds.map((itemId) => this.release(itemId)));
    }

    hasWorkspace(itemId: string): boolean {
        return this.openings.has(itemId);
    }

    // The next acquisition tries again, unless the item was released and opened anew meanwhile.
    private forgetWhenOpeningFails(itemId: string, opening: Promise<Workspace>): void {
        opening.catch(() => {
            if (this.openings.get(itemId) === opening) {
                this.openings.delete(itemId);
            }
        });
    }
}
