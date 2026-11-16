import { createContext, useContext } from "react";
import type { JSX, ReactNode } from "react";

import type { ValidationIssue } from "@/shared/validation_issue.js";
import type { RFEdge } from "@/web/canvas/graph_mapping.js";
import type { IssuesByTarget } from "@/web/canvas/use_validation.js";

export interface TargetValidation {
    invalid: boolean;
    needsConfiguration: boolean;
    issueMessages: string[];
}

const NO_ISSUES: IssuesByTarget = new Map();

const ValidationOverlayContext = createContext<IssuesByTarget>(NO_ISSUES);

export function ValidationOverlay({
    issuesByTarget,
    children,
}: {
    issuesByTarget: IssuesByTarget;
    children: ReactNode;
}): JSX.Element {
    return <ValidationOverlayContext value={issuesByTarget}>{children}</ValidationOverlayContext>;
}

// Only errors mark an element invalid; its tooltip still lists the warnings next to them.
export function useTargetValidation(targetId: string): TargetValidation {
    const issues = useContext(ValidationOverlayContext).get(targetId) ?? [];

    return {
        invalid: hasErrors(issues),
        needsConfiguration: issues.some(isNodeConfigurationError),
        issueMessages: issues.map((issue) => issue.message),
    };
}

export function markInvalidEdges(edges: RFEdge[], issuesByTarget: IssuesByTarget): RFEdge[] {
    return edges.map((edge) => {
        const issues = issuesByTarget.get(edge.id) ?? [];
        if (!hasErrors(issues)) {
            return edge;
        }

        return { ...edge, data: { ...edge.data, invalid: true } };
    });
}

function hasErrors(issues: ValidationIssue[]): boolean {
    return issues.some((issue) => issue.level === "error");
}

function isNodeConfigurationError(issue: ValidationIssue): boolean {
    return issue.level === "error" && issue.target.kind === "node";
}
