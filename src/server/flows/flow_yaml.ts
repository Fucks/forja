import { LineCounter, parseDocument, stringify } from "yaml";
import type { YAMLError } from "yaml";
import { z } from "zod";

import { DomainValidationError } from "@/server/errors.js";
import { describeIssuePath, flowGraphSchema } from "@/shared/flow_graph.js";
import type { FlowEdge, FlowGraph, FlowGroup, FlowNode, Position } from "@/shared/flow_graph.js";
import { flowNameSchema } from "@/shared/flow_types.js";
import { nodeSlug } from "@/shared/node_slug.js";

export const FLOW_FILE_FORMAT_VERSION = 1;
const FLOW_FILE_EXTENSION = ".forja.yaml";
const FALLBACK_FILE_SLUG = "fluxo";
const UNSAFE_FILE_NAME_CHARACTERS = /[^a-z0-9_-]/g;
const FORMAT_VERSION_PATH = "forja";

const MISSING_FORMAT_VERSION_MESSAGE =
    "O arquivo não é um fluxo da Forja: falta o campo forja no início.";
const INVALID_CONTENT_MESSAGE = "O arquivo de fluxo tem campos inválidos.";

// lineWidth 0 never folds long lines, and literal blocks keep multiline prompts readable as typed.
const YAML_OPTIONS = { lineWidth: 0, blockQuote: "literal" } as const;

const FILE_KEY_ORDER = ["forja", "name", "exportedAt", "graph"] as const;
const GRAPH_KEY_ORDER = ["schemaVersion", "nodes", "groups", "edges"] as const;
const NODE_KEY_ORDER = [
    "id",
    "type",
    "label",
    "parentGroupId",
    "position",
    "inputs",
    "outputs",
    "config",
] as const;
const GROUP_KEY_ORDER = [
    "id",
    "kind",
    "label",
    "parentGroupId",
    "position",
    "size",
    "config",
] as const;
const EDGE_KEY_ORDER = ["id", "from", "to"] as const;

export interface FlowFile {
    forja: 1;
    name: string;
    exportedAt: string;
    graph: FlowGraph;
}

export interface FlowFileSyntaxIssue {
    kind: "syntax";
    line: number;
    column: number;
    message: string;
}

export interface FlowFileContentIssue {
    kind: "content";
    path: string;
    message: string;
}

export type FlowFileIssue = FlowFileSyntaxIssue | FlowFileContentIssue;

export class FlowFileError extends DomainValidationError {
    constructor(
        message: string,
        readonly issues: FlowFileIssue[],
    ) {
        super(message, issues);
    }
}

const formatVersionSchema = z.object({ forja: z.unknown() });

const flowFileSchema = z.object({
    forja: z.literal(FLOW_FILE_FORMAT_VERSION),
    name: flowNameSchema,
    exportedAt: z.string(),
    graph: flowGraphSchema,
});

export function flowToYaml(file: FlowFile): string {
    const normalizedFile = { ...file, graph: normalizeFlowGraph(file.graph) };

    return stringify(withKeysInOrder(normalizedFile, FILE_KEY_ORDER), YAML_OPTIONS);
}

/** @throws FlowFileError with the line and column of syntax errors */
export function yamlToFlow(text: string): FlowFile {
    const document = parseYaml(text);
    assertSupportedFormatVersion(document);

    return parseFlowFile(document);
}

/** Sorts nodes, groups and edges, rounds positions and fixes the key order, so equal graphs export
 * to identical text. */
export function normalizeFlowGraph(graph: FlowGraph): FlowGraph {
    const normalizedGraph = {
        ...graph,
        nodes: [...graph.nodes].sort(compareById).map(normalizeNode),
        groups: [...graph.groups].sort(compareById).map(normalizeGroup),
        edges: [...graph.edges].sort(compareEdgeEnds).map(normalizeEdge),
    };

    return withKeysInOrder(normalizedGraph, GRAPH_KEY_ORDER);
}

export function flowFileName(flowName: string): string {
    const slug = nodeSlug(flowName).replace(UNSAFE_FILE_NAME_CHARACTERS, "");

    return `${slug || FALLBACK_FILE_SLUG}${FLOW_FILE_EXTENSION}`;
}

// Objects keep their keys in insertion order, and that is the order the YAML file shows them in.
function withKeysInOrder<T extends object>(value: T, keyOrder: readonly (keyof T)[]): T {
    const orderedEntries = keyOrder
        .filter((key) => key in value)
        .map((key): [PropertyKey, unknown] => [key, value[key]]);

    return Object.assign(Object.fromEntries(orderedEntries), value);
}

// Code-unit order instead of localeCompare, so the file is the same on every machine.
function compareText(a: string, b: string): number {
    if (a < b) {
        return -1;
    }
    if (a > b) {
        return 1;
    }

    return 0;
}

function compareById(a: { id: string }, b: { id: string }): number {
    return compareText(a.id, b.id);
}

function compareEdgeEnds(a: FlowEdge, b: FlowEdge): number {
    return (
        compareText(a.from.nodeId, b.from.nodeId) ||
        compareText(a.from.port, b.from.port) ||
        compareText(a.to.nodeId, b.to.nodeId) ||
        compareText(a.to.port, b.to.port)
    );
}

function normalizeNode(node: FlowNode): FlowNode {
    return withKeysInOrder({ ...node, position: roundPosition(node.position) }, NODE_KEY_ORDER);
}

function normalizeGroup(group: FlowGroup): FlowGroup {
    return withKeysInOrder({ ...group, position: roundPosition(group.position) }, GROUP_KEY_ORDER);
}

function normalizeEdge(edge: FlowEdge): FlowEdge {
    return withKeysInOrder(edge, EDGE_KEY_ORDER);
}

function roundPosition(position: Position): Position {
    return { x: Math.round(position.x), y: Math.round(position.y) };
}

function parseYaml(text: string): unknown {
    const lineCounter = new LineCounter();
    const document = parseDocument(text, { lineCounter });
    const syntaxIssues = document.errors.map((error) => toSyntaxIssue(error, lineCounter));
    const [firstIssue] = syntaxIssues;
    if (firstIssue) {
        const message = `O YAML é inválido na linha ${firstIssue.line}, coluna ${firstIssue.column}.`;
        throw new FlowFileError(message, syntaxIssues);
    }

    return document.toJS();
}

function toSyntaxIssue(error: YAMLError, lineCounter: LineCounter): FlowFileSyntaxIssue {
    const [startOffset] = error.pos;
    const { line, col } = lineCounter.linePos(startOffset);

    return { kind: "syntax", line, column: col, message: firstLineOf(error.message) };
}

// The parser appends a code frame of the broken line after the first line of its message.
function firstLineOf(text: string): string {
    const [firstLine = text] = text.split("\n");

    return firstLine;
}

function assertSupportedFormatVersion(document: unknown): void {
    const formatVersion = formatVersionSchema.safeParse(document).data?.forja;
    if (formatVersion === FLOW_FILE_FORMAT_VERSION) {
        return;
    }

    const message =
        formatVersion === undefined
            ? MISSING_FORMAT_VERSION_MESSAGE
            : describeUnknownFormatVersion(formatVersion);
    throw new FlowFileError(message, [{ kind: "content", path: FORMAT_VERSION_PATH, message }]);
}

function describeUnknownFormatVersion(formatVersion: unknown): string {
    return (
        `Versão de arquivo desconhecida (forja: ${JSON.stringify(formatVersion)}). ` +
        `Esta versão da Forja lê apenas arquivos com forja: ${FLOW_FILE_FORMAT_VERSION}.`
    );
}

function parseFlowFile(document: unknown): FlowFile {
    const result = flowFileSchema.safeParse(document);
    if (!result.success) {
        throw new FlowFileError(INVALID_CONTENT_MESSAGE, result.error.issues.map(toContentIssue));
    }

    return result.data;
}

function toContentIssue(issue: z.core.$ZodIssue): FlowFileContentIssue {
    return { kind: "content", path: describeIssuePath(issue), message: issue.message };
}
