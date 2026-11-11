import { useEffect, useMemo, useState } from "react";

import { validateFlowGraph } from "@/engine/graph_validation.js";
import type { ValidationContext } from "@/engine/graph_validation.js";
import { checkPromptVariables } from "@/engine/prompt_template.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";

export const VALIDATION_DEBOUNCE_MS = 250;

export interface GraphValidation {
    issues: ValidationIssue[];
    byTarget: Map<string, ValidationIssue[]>;
    errorCount: number;
    warningCount: number;
}

// Validated after the user pauses, so dragging a node does not rerun every rule on each frame.
export function useValidation(graph: FlowGraph, context: ValidationContext): GraphValidation {
    const settledGraph = useDebouncedValue(graph, VALIDATION_DEBOUNCE_MS);

    return useMemo(() => summarizeValidation(settledGraph, context), [settledGraph, context]);
}

export function groupIssuesByTarget(issues: ValidationIssue[]): Map<string, ValidationIssue[]> {
    const byTarget = new Map<string, ValidationIssue[]>();
    for (const issue of issues) {
        const targetId = issue.target.id;
        if (targetId !== undefined) {
            byTarget.set(targetId, [...(byTarget.get(targetId) ?? []), issue]);
        }
    }

    return byTarget;
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
function summarizeValidation(graph: FlowGraph, context: ValidationContext): GraphValidation {
    const issues = validateFlowGraph(graph, { ...context, checkPrompt: checkPromptVariables });

    return {
        issues,
        byTarget: groupIssuesByTarget(issues),
        errorCount: countIssuesOfLevel(issues, "error"),
        warningCount: countIssuesOfLevel(issues, "warning"),
    };
}

function countIssuesOfLevel(issues: ValidationIssue[], level: ValidationIssue["level"]): number {
    return issues.filter((issue) => issue.level === level).length;
}
