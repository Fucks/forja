import { describeAvailableData } from "@/engine/available_data.js";
import type { DataField, DataType } from "@/engine/available_data.js";
import { errorIssue, nodeTarget } from "@/engine/validation_rules/validation_issues.js";
import { listComparisons } from "@/shared/conditions.js";
import type { Comparison, ComparisonOperator } from "@/shared/conditions.js";
import { isNodeOfType } from "@/shared/flow_graph.js";
import type { FlowGraph, NodeOfType, NodeType, Port } from "@/shared/flow_graph.js";
import { listDecisionConditions } from "@/shared/node_configs/condition_branches.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";

type KnownDataType = Exclude<DataType, "any">;

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

const LAST_SUGGESTION_SEPARATOR = " ou ";
const SUGGESTION_SEPARATOR = ", ";

export function findConditionOperatorTypeProblems(graph: FlowGraph): ValidationIssue[] {
    return graph.nodes
        .filter((node) => isNodeOfType(node, "condition"))
        .flatMap((decision) => findOperatorTypeProblemsOf(graph, decision));
}

/** Why the operator does not fit a value of the type; undefined when it fits or the type is unknown. */
export function describeOperatorTypeMismatch(
    operator: ComparisonOperator,
    type: DataType,
): string | undefined {
    if (type === "any" || ACCEPTED_OPERATORS[type].includes(operator)) {
        return undefined;
    }

    const suggestions = listInWords(SUGGESTED_OPERATOR_LABELS[type].map(quote));

    return `${quote(OPERATOR_LABELS[operator])} não serve para ${TYPE_LABELS[type]}. Escolha ${suggestions}.`;
}

function findOperatorTypeProblemsOf(
    graph: FlowGraph,
    decision: NodeOfType<"condition">,
): ValidationIssue[] {
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

        return [errorIssue("condition_operator_type", mismatch, nodeTarget(decision.id))];
    });
}

// Only the paths matter here, so the ports keep their technical names.
function labelPortByName(_nodeType: NodeType, port: Port): string {
    return port.name;
}

function findMismatch(comparison: Comparison, fields: DataField[]): string | undefined {
    const field = fields.find((candidate) => candidate.path === comparison.path);
    if (!field) {
        return undefined;
    }

    return describeOperatorTypeMismatch(comparison.op, field.type);
}

function quote(text: string): string {
    return `‘${text}’`;
}

function listInWords(words: string[]): string {
    const lastWord = words.at(-1) ?? "";
    const firstWords = words.slice(0, -1);
    if (firstWords.length === 0) {
        return lastWord;
    }

    return firstWords.join(SUGGESTION_SEPARATOR) + LAST_SUGGESTION_SEPARATOR + lastWord;
}
