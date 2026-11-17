import {
    areTypesCompatible,
    enclosingGroups,
    incomingEdges,
    isMapGroup,
} from "@/engine/graph_queries.js";
import { findSourcePort, findTargetPort } from "@/engine/validation_rules/graph_lookups.js";
import { edgeTarget, errorIssue, nodeTarget } from "@/engine/validation_rules/validation_issues.js";
import {
    type FlowEdge,
    type FlowGraph,
    type FlowNode,
    isNodeOfType,
    type NodeOfType,
    type Port,
} from "@/shared/flow_graph.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";

export interface Connection {
    edge: FlowEdge;
    sourcePort: Port;
    targetPort: Port;
}

export function findDanglingEdges(graph: FlowGraph): ValidationIssue[] {
    const danglingEdges = graph.edges.filter((edge) => !resolveConnection(graph, edge));

    return danglingEdges.map((edge) =>
        errorIssue(
            "dangling_edge",
            "A aresta aponta para um nó ou porta que não existe.",
            edgeTarget(edge.id),
        ),
    );
}

export function findUnconnectedRequiredInputs(graph: FlowGraph): ValidationIssue[] {
    return graph.nodes.flatMap((node) => findUnconnectedRequiredInputsOfNode(graph, node));
}

export function findScriptConfigProblems(graph: FlowGraph): ValidationIssue[] {
    const scripts = graph.nodes.filter((node) => isNodeOfType(node, "script"));

    return scripts.flatMap((script) => [
        ...findEmptyCommand(script),
        ...findImageWithoutIsolatedContainer(script),
        ...findDuplicateEnvVars(script),
    ]);
}

export function findIncompatiblePorts(graph: FlowGraph): ValidationIssue[] {
    const incompatibleConnections = resolveConnections(graph).filter(
        (connection) => !isConnectionCompatible(graph, connection),
    );

    return incompatibleConnections.map(({ edge, sourcePort, targetPort }) =>
        errorIssue(
            "incompatible_ports",
            `A saída "${sourcePort.name}" (${sourcePort.type}) não é compatível com a entrada ` +
                `"${targetPort.name}" (${targetPort.type}).`,
            edgeTarget(edge.id),
        ),
    );
}

function resolveConnections(graph: FlowGraph): Connection[] {
    return graph.edges.flatMap((edge) => resolveConnection(graph, edge) ?? []);
}

export function resolveConnection(graph: FlowGraph, edge: FlowEdge): Connection | undefined {
    const sourcePort = findSourcePort(graph, edge);
    const targetPort = findTargetPort(graph, edge);
    if (!sourcePort || !targetPort) {
        return undefined;
    }

    return { edge, sourcePort, targetPort };
}

function findUnconnectedRequiredInputsOfNode(graph: FlowGraph, node: FlowNode): ValidationIssue[] {
    const unconnectedInputs = inputsThatMustBeConnected(graph, node).filter(
        (port) => !isInputConnected(graph, node, port),
    );

    return unconnectedInputs.map((port) =>
        errorIssue(
            "required_input_unconnected",
            `A entrada obrigatória "${port.name}" do nó "${node.label}" não está ligada.`,
            nodeTarget(node.id),
        ),
    );
}

function inputsThatMustBeConnected(graph: FlowGraph, node: FlowNode): Port[] {
    const isItemImplicit = enclosingGroups(graph, node.id).some(isMapGroup);
    const requiredInputs = node.inputs.filter((port) => port.required);
    if (!isItemImplicit && !runsWithoutItem(node)) {
        return requiredInputs;
    }

    return requiredInputs.filter((port) => port.type !== "workItem");
}

function runsWithoutItem(node: FlowNode): boolean {
    return isNodeOfType(node, "script") && node.config.runIn === "isolated";
}

function isInputConnected(graph: FlowGraph, node: FlowNode, port: Port): boolean {
    return incomingEdges(graph, node.id).some((edge) => edge.to.port === port.name);
}

export function isConnectionCompatible(graph: FlowGraph, connection: Connection): boolean {
    const { edge, sourcePort, targetPort } = connection;
    if (areTypesCompatible(sourcePort.type, targetPort.type)) {
        return true;
    }

    const isListSplitIntoItems =
        sourcePort.type === "workItemList" && targetPort.type === "workItem";
    return isListSplitIntoItems && entersMapOfTarget(graph, edge);
}

function entersMapOfTarget(graph: FlowGraph, edge: FlowEdge): boolean {
    const sourceGroups = enclosingGroups(graph, edge.from.nodeId);
    const targetMaps = enclosingGroups(graph, edge.to.nodeId).filter(isMapGroup);

    return targetMaps.some((map) => !sourceGroups.includes(map));
}

type ScriptNode = NodeOfType<"script">;

function findEmptyCommand(script: ScriptNode): ValidationIssue[] {
    if (script.config.command.trim() !== "") {
        return [];
    }

    return [
        errorIssue(
            "empty_command",
            `O nó "${script.label}" não tem comando.`,
            nodeTarget(script.id),
        ),
    ];
}

function findImageWithoutIsolatedContainer(script: ScriptNode): ValidationIssue[] {
    const { image, runIn } = script.config;
    const namesImage = image !== undefined && image.trim() !== "";
    if (!namesImage || runIn === "isolated") {
        return [];
    }

    return [
        errorIssue(
            "script_image_without_isolated",
            `O nó "${script.label}" só pode escolher a imagem quando roda num container isolado.`,
            nodeTarget(script.id),
        ),
    ];
}

function findDuplicateEnvVars(script: ScriptNode): ValidationIssue[] {
    const names = script.config.env.map((envVar) => envVar.name);
    const repeatedNames = new Set(names.filter((name, index) => names.indexOf(name) !== index));

    return [...repeatedNames].map((name) =>
        errorIssue(
            "duplicate_env_var",
            `O nó "${script.label}" define a variável ${name} mais de uma vez.`,
            nodeTarget(script.id),
        ),
    );
}
