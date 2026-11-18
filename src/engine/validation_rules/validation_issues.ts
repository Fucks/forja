import type { ValidationIssue } from "@/shared/validation_issue.js";

export type IssueTarget = ValidationIssue["target"];

/** What a rule says about a problem: `fix` is required, so every rule teaches how to solve it. */
export interface IssueDescription {
    code: string;
    message: string;
    fix: string;
    fieldKey?: string;
    target: IssueTarget;
}

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

export function errorIssue(description: IssueDescription): ValidationIssue {
    return { level: "error", ...description };
}

export function warningIssue(description: IssueDescription): ValidationIssue {
    return { level: "warning", ...description };
}

export function quote(text: string): string {
    return `‘${text}’`;
}
