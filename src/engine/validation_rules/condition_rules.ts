import { describeAvailableData } from "@/engine/available_data.js";
import type { DataField, DataType } from "@/engine/available_data.js";
import {
    edgeTarget,
    errorIssue,
    nodeTarget,
    quote,
} from "@/engine/validation_rules/validation_issues.js";
import { listComparisons } from "@/shared/conditions.js";
import type { Comparison, ComparisonOperator } from "@/shared/conditions.js";
import { isNodeOfType } from "@/shared/flow_graph.js";
import type { FlowGraph, NodeOfType, NodeType, Port } from "@/shared/flow_graph.js";
import {
    branchPortsOf,
    FALSE_BRANCH_PORT,
    listDecisionConditions,
    TRUE_BRANCH_PORT,
} from "@/shared/node_configs/condition_branches.js";
import { OTHERWISE_PORT } from "@/shared/node_configs/condition_config.js";
import type {
    SwitchBranch,
    SwitchConditionConfig,
} from "@/shared/node_configs/condition_config.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";

type KnownDataType = Exclude<DataType, "any">;
type Decision = NodeOfType<"condition">;
type SwitchDecision = Decision & { config: SwitchConditionConfig };

const RESERVED_BRANCH_PORTS = [OTHERWISE_PORT, TRUE_BRANCH_PORT, FALSE_BRANCH_PORT];

const ACCEPTED_OPERATORS: Record<KnownDataType, ComparisonOperator[]> = {
    boolean: ["eq", "neq", "exists"],
    number: ["eq", "neq", "gt", "gte", "lt", "lte", "in", "exists"],
    string: [
        "eq",
        "neq",
        "contains",
        "notContains",
        "startsWith",
        "in",
        "isEmpty",
        "isNotEmpty",
        "minLength",
        "exists",
    ],
    list: ["contains", "notContains", "isEmpty", "isNotEmpty", "minLength", "exists"],
    object: ["isEmpty", "isNotEmpty", "exists"],
};

const OPERATOR_LABELS: Record<ComparisonOperator, string> = {
    eq: "é igual a",
    neq: "é diferente de",
    gt: ">",
    gte: "≥",
    lt: "<",
    lte: "≤",
    contains: "contém",
    notContains: "não contém",
    startsWith: "começa com",
    in: "é um de",
    isEmpty: "está vazio",
    isNotEmpty: "não está vazio",
    minLength: "tem pelo menos",
    exists: "existe",
};

const TYPE_LABELS: Record<KnownDataType, string> = {
    boolean: "sim/não",
    number: "número",
    string: "texto",
    list: "lista",
    object: "objeto",
};

const SUGGESTED_OPERATOR_LABELS: Record<KnownDataType, string[]> = {
    boolean: ["é verdadeiro", "é falso"],
    number: ["=", "≠", ">", "≥", "<", "≤"],
    string: ["é igual a", "contém", "está vazio"],
    list: ["contém", "está vazia", "tem pelo menos"],
    object: ["existe", "não existe"],
};

const CONDITION_FIELD = "condition";
const BRANCHES_FIELD = "branches";

const LAST_SUGGESTION_SEPARATOR = " ou ";
const SUGGESTION_SEPARATOR = ", ";

export function findConditionOperatorTypeProblems(graph: FlowGraph): ValidationIssue[] {
    return listDecisions(graph).flatMap((decision) => findOperatorTypeProblemsOf(graph, decision));
}

export function findConditionBranchProblems(graph: FlowGraph): ValidationIssue[] {
    return listDecisions(graph).filter(isSwitchDecision).flatMap(findBranchProblemsOf);
}

export function findEdgesWithoutBranch(graph: FlowGraph): ValidationIssue[] {
    return listDecisions(graph).flatMap((decision) => findEdgesWithoutBranchOf(graph, decision));
}

interface OperatorTypeMismatch {
    problem: string;
    suggestion: string;
}

/** Why the operator does not fit a value of the type; undefined when it fits or the type is unknown. */
export function describeOperatorTypeMismatch(
    operator: ComparisonOperator,
    type: DataType,
): string | undefined {
    const mismatch = findOperatorTypeMismatch(operator, type);
    if (!mismatch) {
        return undefined;
    }

    return `${mismatch.problem}. ${mismatch.suggestion}.`;
}

function findOperatorTypeMismatch(
    operator: ComparisonOperator,
    type: DataType,
): OperatorTypeMismatch | undefined {
    if (type === "any" || ACCEPTED_OPERATORS[type].includes(operator)) {
        return undefined;
    }

    const suggestions = listInWords(SUGGESTED_OPERATOR_LABELS[type].map(quote));

    return {
        problem: `${quote(OPERATOR_LABELS[operator])} não serve para ${TYPE_LABELS[type]}`,
        suggestion: `Escolha ${suggestions}`,
    };
}

function findOperatorTypeProblemsOf(graph: FlowGraph, decision: Decision): ValidationIssue[] {
    const fields = describeAvailableData(graph, decision.id, {
        scope: "node",
        portLabels: labelPortByName,
    });

    const comparisons = listDecisionConditions(decision.config).flatMap(listComparisons);

    return comparisons.flatMap((comparison) => {
        const mismatch = findMismatch(comparison, fields);
        if (mismatch === undefined) {
            return [];
        }

        return [
            errorIssue({
                code: "condition_operator_type",
                message: `Na Decisão ${quote(decision.label)}, ${mismatch.problem}.`,
                fix: `${mismatch.suggestion} na regra que lê ${quote(comparison.path)}.`,
                fieldKey: CONDITION_FIELD,
                target: nodeTarget(decision.id),
            }),
        ];
    });
}

function listDecisions(graph: FlowGraph): Decision[] {
    return graph.nodes.filter((node) => isNodeOfType(node, "condition"));
}

function isSwitchDecision(decision: Decision): decision is SwitchDecision {
    return decision.config.mode === "switch";
}

function findBranchProblemsOf(decision: SwitchDecision): ValidationIssue[] {
    return [
        ...findDuplicatePortIssues(decision),
        ...findReservedPortIssues(decision),
        ...findEmptyRuleIssues(decision),
    ];
}

function findDuplicatePortIssues(decision: SwitchDecision): ValidationIssue[] {
    return findDuplicatePorts(decision.config.branches).map((port) =>
        branchIssue(decision, {
            code: "condition_branch_port_duplicate",
            problem: `dois caminhos usam a saída ${quote(port)}`,
            fix: "Dê outro nome a um dos caminhos.",
        }),
    );
}

function findReservedPortIssues(decision: SwitchDecision): ValidationIssue[] {
    return decision.config.branches.filter(usesReservedPort).map((branch) =>
        branchIssue(decision, {
            code: "condition_branch_port_reserved",
            problem:
                `o caminho ${quote(branch.label)} usa a saída ${quote(branch.port)}, ` +
                "que é reservada da Decisão",
            fix: `Dê outro nome ao caminho ${quote(branch.label)}.`,
        }),
    );
}

function findEmptyRuleIssues(decision: SwitchDecision): ValidationIssue[] {
    return decision.config.branches.filter(hasEmptyRule).map((branch) =>
        branchIssue(decision, {
            code: "condition_branch_empty_rule",
            problem: `o caminho ${quote(branch.label)} não tem regra`,
            fix: `Escolha um dado e uma regra para o caminho ${quote(branch.label)} ou apague-o.`,
        }),
    );
}

function branchIssue(
    decision: SwitchDecision,
    { code, problem, fix }: { code: string; problem: string; fix: string },
): ValidationIssue {
    return errorIssue({
        code,
        message: `Na Decisão ${quote(decision.label)}, ${problem}.`,
        fix,
        fieldKey: BRANCHES_FIELD,
        target: nodeTarget(decision.id),
    });
}

function findDuplicatePorts(branches: SwitchBranch[]): string[] {
    const ports = branches.map((branch) => branch.port);
    const repeatedPorts = ports.filter((port, index) => ports.indexOf(port) !== index);

    return [...new Set(repeatedPorts)];
}

function usesReservedPort(branch: SwitchBranch): boolean {
    return RESERVED_BRANCH_PORTS.includes(branch.port);
}

function hasEmptyRule(branch: SwitchBranch): boolean {
    const comparisons = listComparisons(branch.condition);

    return comparisons.length === 0 || comparisons.some(readsNoData);
}

function readsNoData(comparison: Comparison): boolean {
    return comparison.path.trim() === "";
}

function findEdgesWithoutBranchOf(graph: FlowGraph, decision: Decision): ValidationIssue[] {
    const branchPortNames = branchPortsOf(decision.config).map((port) => port.name);
    const edgesWithoutBranch = graph.edges.filter(
        (edge) => edge.from.nodeId === decision.id && !branchPortNames.includes(edge.from.port),
    );

    return edgesWithoutBranch.map((edge) =>
        errorIssue({
            code: "condition_edge_without_branch",
            message:
                `Uma ligação sai do caminho ${quote(edge.from.port)} da Decisão ` +
                `${quote(decision.label)}, que não existe mais.`,
            fix: `Apague essa ligação ou crie de novo o caminho ${quote(edge.from.port)}.`,
            target: edgeTarget(edge.id),
        }),
    );
}

// Only the paths matter here, so the ports keep their technical names.
function labelPortByName(_nodeType: NodeType, port: Port): string {
    return port.name;
}

function findMismatch(
    comparison: Comparison,
    fields: DataField[],
): OperatorTypeMismatch | undefined {
    const field = fields.find((candidate) => candidate.path === comparison.path);
    if (!field) {
        return undefined;
    }

    return findOperatorTypeMismatch(comparison.op, field.type);
}

function listInWords(words: string[]): string {
    const lastWord = words.at(-1) ?? "";
    const firstWords = words.slice(0, -1);
    if (firstWords.length === 0) {
        return lastWord;
    }

    return firstWords.join(SUGGESTION_SEPARATOR) + LAST_SUGGESTION_SEPARATOR + lastWord;
}
