export const DATA_ROOTS = ["item", "inputs", "nodes", "run", "project"] as const;
export type DataRoot = (typeof DATA_ROOTS)[number];

export type NodeOutputsBySlug = Record<string, Record<string, unknown>>;

/** What a prompt, a condition, a loop `until` and a git `bodyFrom` can read by path. */
export interface DataContext {
    inputs: Record<string, unknown>;
    nodes: NodeOutputsBySlug;
    item?: {
        id: string;
        title: string;
        body: string;
        number?: number;
        url?: string;
        labels: string[];
        branch?: string;
    };
    project: { name: string; baseBranch: string; githubRepo?: string };
    run: { id: string; iteration: number; attempt: number };
}
