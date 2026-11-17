import { CONDITION_PATH_SEPARATOR } from "@/shared/conditions.js";

export const DATA_ROOTS = ["item", "inputs", "nodes", "run", "project"] as const;
export type DataRoot = (typeof DATA_ROOTS)[number];
export const NODES_ROOT: DataRoot = "nodes";

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

// The slug of the node a `nodes.<slug>...` path reads; undefined when the path reads another root.
export function findNodeSlugInPath(path: string): string | undefined {
    const [root, slug = ""] = path.split(CONDITION_PATH_SEPARATOR);
    if (root !== NODES_ROOT) {
        return undefined;
    }

    return slug;
}

export function buildNodeOutputPath(slug: string, port: string): string {
    return [NODES_ROOT, slug, port].join(CONDITION_PATH_SEPARATOR);
}
