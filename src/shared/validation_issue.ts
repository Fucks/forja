export interface ValidationIssue {
    level: "error" | "warning";
    code: string;
    message: string;
    target: { kind: "node" | "edge" | "group" | "flow"; id?: string };
}
