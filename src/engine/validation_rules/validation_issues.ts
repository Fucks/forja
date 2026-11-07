import type { ValidationIssue } from "@/shared/validation_issue.js";

export type IssueTarget = ValidationIssue["target"];

export const FLOW_TARGET: IssueTarget = { kind: "flow" };

export function nodeTarget(nodeId: string): IssueTarget {
    return { kind: "node", id: nodeId };
}

export function edgeTarget(edgeId: string): IssueTarget {
    return { kind: "edge", id: edgeId };
}

export function groupTarget(groupId: string): IssueTarget {
    return { kind: "group", id: groupId };
}

export function errorIssue(code: string, message: string, target: IssueTarget): ValidationIssue {
    return { level: "error", code, message, target };
}

export function warningIssue(code: string, message: string, target: IssueTarget): ValidationIssue {
    return { level: "warning", code, message, target };
}
