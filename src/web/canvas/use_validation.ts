import { useEffect, useMemo, useState } from "react";

import { validateFlowGraph } from "@/engine/graph_validation.js";
import type { ValidationContext } from "@/engine/graph_validation.js";
import { checkPromptVariables } from "@/engine/prompt_template.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";

export const VALIDATION_DEBOUNCE_MS = 250;

export const ISSUE_NOUNS: Record<ValidationIssue["level"], { one: string; other: string }> = {
    error: { one: "erro", other: "erros" },
    warning: { one: "aviso", other: "avisos" },
};

export type IssuesByTarget = Map<string, ValidationIssue[]>;

export interface GraphValidation {
    issues: ValidationIssue[];
    byTarget: IssuesByTarget;
    errorCount: number;
    warningCount: number;
}

// Validated after the user pauses, so dragging a node does not rerun every rule on each frame.
export function useValidation(graph: FlowGraph, context: ValidationContext): GraphValidation {
    const settledGraph = useDebouncedValue(graph, VALIDATION_DEBOUNCE_MS);

    return useMemo(() => validateLikeTheServer(settledGraph, context), [settledGraph, context]);
}

export function summarizeIssues(issues: ValidationIssue[]): GraphValidation {
    return {
        issues,
        byTarget: groupIssuesByTarget(issues),
        errorCount: countIssuesOfLevel(issues, "error"),
        warningCount: countIssuesOfLevel(issues, "warning"),
    };
}

/** Tells issues apart in React lists and when merging the server's issues with the canvas'. */
export function describeIssueKey({ code, target, message }: ValidationIssue): string {
    return `${code}:${target.kind}:${target.id ?? ""}:${message}`;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
    const [settledValue, setSettledValue] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setSettledValue(value), delayMs);

        return () => clearTimeout(timer);
    }, [value, delayMs]);

    return settledValue;
}

// The same rules the server applies before publishing, so the canvas never promises a publish
// that the server would refuse.
function validateLikeTheServer(graph: FlowGraph, context: ValidationContext): GraphValidation {
    return summarizeIssues(
        validateFlowGraph(graph, { ...context, checkPrompt: checkPromptVariables }),
    );
}

function countIssuesOfLevel(issues: ValidationIssue[], level: ValidationIssue["level"]): number {
    return issues.filter((issue) => issue.level === level).length;
}

function groupIssuesByTarget(issues: ValidationIssue[]): IssuesByTarget {
    const byTarget: IssuesByTarget = new Map();
    for (const issue of issues) {
        const targetId = issue.target.id;
        if (targetId !== undefined) {
            byTarget.set(targetId, [...(byTarget.get(targetId) ?? []), issue]);
        }
    }

    return byTarget;
}
