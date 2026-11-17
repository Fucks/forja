import {
    checkAgentPrompts,
    findEmptyPrompts,
    findUnknownCredentials,
    findUnknownToolProfiles,
} from "@/engine/validation_rules/agent_rules.js";
import {
    findGroupOverlaps,
    findMapListInputProblems,
} from "@/engine/validation_rules/group_rules.js";
import {
    checkTriggerCount,
    findDuplicateIds,
    findDuplicateNodeSlugs,
} from "@/engine/validation_rules/identity_rules.js";
import {
    findCyclesOutsideLoops,
    findLoopsWithoutBackEdge,
    findLoopsWithoutCondition,
    findUnknownLoopConditionPaths,
} from "@/engine/validation_rules/loop_rules.js";
import {
    findDanglingEdges,
    findIncompatiblePorts,
    findUnconnectedRequiredInputs,
} from "@/engine/validation_rules/port_rules.js";
import { findScriptConfigProblems } from "@/engine/validation_rules/script_rules.js";
import type { FlowGraph, NodeOfType } from "@/shared/flow_graph.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";

export type AgentNode = NodeOfType<"agent">;

export interface ValidationContext {
    knownToolProfileIds?: string[];
    knownCredentialIds?: string[];
    checkPrompt?(node: AgentNode, graph: FlowGraph): ValidationIssue[];
}

type ValidationRule = (graph: FlowGraph, context: ValidationContext) => ValidationIssue[];

const VALIDATION_RULES: ValidationRule[] = [
    findDuplicateIds,
    findDuplicateNodeSlugs,
    checkTriggerCount,
    findDanglingEdges,
    findUnconnectedRequiredInputs,
    findIncompatiblePorts,
    findScriptConfigProblems,
    findGroupOverlaps,
    findMapListInputProblems,
    findCyclesOutsideLoops,
    findLoopsWithoutBackEdge,
    findLoopsWithoutCondition,
    findUnknownLoopConditionPaths,
    findEmptyPrompts,
    findUnknownToolProfiles,
    findUnknownCredentials,
    checkAgentPrompts,
];

const LEVEL_ORDER: Record<ValidationIssue["level"], number> = { error: 0, warning: 1 };

export function validateFlowGraph(
    graph: FlowGraph,
    context: ValidationContext = {},
): ValidationIssue[] {
    const issues = VALIDATION_RULES.flatMap((rule) => rule(graph, context));

    return issues.toSorted((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}
