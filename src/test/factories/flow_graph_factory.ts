import {
    type FlowEdge,
    type FlowGraph,
    type FlowGroup,
    type FlowNode,
    isNodeOfType,
    LOOP_EXHAUSTED_PORT,
    type NodeOfType,
    type NodeType,
    type Position,
} from "@/shared/flow_graph.js";
import type { GateConfig } from "@/shared/node_configs/gate_config.js";
import { createDefaultNode } from "@/shared/node_defaults.js";

const GRID_STEP_PX = 240;
const LOOP_GROUP_PADDING_PX = 40;
const MAP_GROUP_PADDING_PX = 2 * LOOP_GROUP_PADDING_PX;
const NODE_HEIGHT_PX = 120;
const ROWS_PER_GROUP = 3;
const LOOP_COLUMNS = { first: 2, count: 3 };

const TL_OUTPUT_SCHEMA = {
    type: "object",
    properties: { ready: { type: "boolean" } },
    required: ["ready"],
};

const REVIEWER_OUTPUT_SCHEMA = {
    type: "object",
    properties: { approved: { type: "boolean" }, notes: { type: "string" } },
    required: ["approved", "notes"],
};

export function buildCanonicalFlow(): FlowGraph {
    const specifyGroup = buildMapGroup({
        id: "specify",
        label: "Especificar",
        columns: { first: 2, count: 1 },
        concurrency: 1,
    });
    const developGroup = buildMapGroup({
        id: "develop",
        label: "Desenvolver",
        columns: { first: 3, count: 1 },
        concurrency: 3,
    });
    const reviewGroup = buildMapGroup({
        id: "review_and_open_pr",
        label: "Revisar e abrir PR",
        columns: { first: 4, count: 1 },
        concurrency: 1,
    });

    return {
        schemaVersion: 2,
        nodes: [
            buildTriggerNode(),
            buildSourceNode(),
            { ...buildTechLeadNode(), parentGroupId: specifyGroup.id },
            { ...buildDeveloperNode(), parentGroupId: developGroup.id },
            { ...buildReviewerNode(), parentGroupId: reviewGroup.id },
            { ...buildOpenPullRequestNode(), parentGroupId: reviewGroup.id },
            { ...buildDoneOutputNode(), parentGroupId: reviewGroup.id },
        ],
        edges: [
            connect(["trigger", "items"], ["source", "trigger"]),
            connect(["source", "items"], ["tl", "item"]),
            connect(["tl", "summary"], ["dev", "spec"]),
            connect(["dev", "summary"], ["reviewer", "context"]),
            connect(["reviewer", "summary"], ["open_pr", "body"]),
        ],
        groups: [specifyGroup, developGroup, reviewGroup],
    };
}

export function buildLoopFlow(): FlowGraph {
    const itemsGroup = buildMapGroup({
        id: "items",
        label: "Por item",
        columns: LOOP_COLUMNS,
        concurrency: 2,
    });
    const reviewLoop = buildReviewLoopGroup(itemsGroup.id);

    return {
        schemaVersion: 2,
        nodes: [
            buildTriggerNode(),
            buildSourceNode(),
            { ...buildLoopDeveloperNode(), parentGroupId: reviewLoop.id },
            { ...buildTestsScriptNode(), parentGroupId: reviewLoop.id },
            { ...buildLoopReviewerNode(), parentGroupId: reviewLoop.id },
        ],
        edges: [
            connect(["trigger", "items"], ["source", "trigger"]),
            connect(["source", "items"], ["dev", "item"]),
            connect(["dev", "summary"], ["review", "context"]),
            connect(["tests", "result"], ["review", "tests"]),
            connect(["review", "summary"], ["dev", "notes"]),
        ],
        groups: [itemsGroup, reviewLoop],
    };
}

// The loop flow with its two ways out: approved reviews open a PR; an exhausted loop asks for a human.
export function buildLoopFlowWithExits(): FlowGraph {
    const loopFlow = buildLoopFlow();

    return {
        ...loopFlow,
        nodes: [
            ...loopFlow.nodes,
            { ...buildOpenPullRequestNode(), parentGroupId: "items" },
            { ...buildNeedsHumanOutputNode(), parentGroupId: "items" },
        ],
        edges: [
            ...loopFlow.edges,
            connect(["review", "summary"], ["open_pr", "body"]),
            connect(["review_loop", LOOP_EXHAUSTED_PORT], ["needs_human", "item"]),
        ],
    };
}

// trigger → map(gate → approved: done; rejected: rework)
export function buildApprovalFlow(gateConfig: Partial<GateConfig> = {}): FlowGraph {
    const reviewGroup = buildMapGroup({
        id: "review",
        label: "Revisar",
        columns: { first: 1, count: 2 },
        concurrency: 1,
    });
    const gate = createNodeOfType("gate", "gate", gridPosition(1));
    const rework = createNodeOfType("agent", "rework", gridPosition(2, 1));

    return {
        schemaVersion: 2,
        nodes: [
            buildTriggerNode(),
            {
                ...gate,
                parentGroupId: reviewGroup.id,
                config: { ...gate.config, message: "Revise o diff", ...gateConfig },
            },
            {
                ...createDefaultNode("output", "done", gridPosition(2)),
                parentGroupId: reviewGroup.id,
            },
            {
                ...rework,
                parentGroupId: reviewGroup.id,
                config: { ...rework.config, prompt: "Corrija a issue #{{item.number}}" },
            },
        ],
        edges: [
            connect(["trigger", "items"], ["gate", "item"]),
            connect(["gate", "approved"], ["done", "item"]),
            connect(["gate", "rejected"], ["rework", "item"]),
        ],
        groups: [reviewGroup],
    };
}

export function connect(
    [fromNodeId, fromPort]: [string, string],
    [toNodeId, toPort]: [string, string],
): FlowEdge {
    return {
        id: `${fromNodeId}.${fromPort}->${toNodeId}.${toPort}`,
        from: { nodeId: fromNodeId, port: fromPort },
        to: { nodeId: toNodeId, port: toPort },
    };
}

function buildTriggerNode(): FlowNode {
    return createDefaultNode("trigger", "trigger", gridPosition(0));
}

function buildSourceNode(): FlowNode {
    const source = createNodeOfType("source", "source", gridPosition(1));

    return { ...source, config: { ...source.config, label: "Sandcastle", skipBlocked: true } };
}

function buildTechLeadNode(): FlowNode {
    const techLead = createNodeOfType("agent", "tl", gridPosition(2));

    return {
        ...techLead,
        label: "TL",
        config: {
            ...techLead.config,
            prompt: "Escreva a especificação da issue #{{item.number}} ({{item.title}}):\n{{item.body}}",
            workspace: "none",
            effort: "high",
            toolProfileId: "tlp_builtin_readonly",
            outputSchema: TL_OUTPUT_SCHEMA,
        },
    };
}

function buildDeveloperNode(): FlowNode {
    const developer = createNodeOfType("agent", "dev", gridPosition(3));

    return {
        ...developer,
        label: "Dev",
        inputs: [...developer.inputs, { name: "spec", type: "text", required: true }],
        config: {
            ...developer.config,
            prompt: "Implemente a issue #{{item.number}} seguindo a especificação:\n{{inputs.spec}}",
            maxIterations: 50,
            completionSignal: "<promise>COMPLETE</promise>",
            toolProfileId: "tlp_builtin_codegraph",
        },
    };
}

function buildReviewerNode(): FlowNode {
    const reviewer = createNodeOfType("agent", "reviewer", gridPosition(4));

    return {
        ...reviewer,
        label: "Reviewer",
        config: {
            ...reviewer.config,
            prompt: "Revise o branch da issue #{{item.number}}.\n{{inputs.context}}",
            effort: "high",
            outputSchema: REVIEWER_OUTPUT_SCHEMA,
        },
    };
}

function buildOpenPullRequestNode(): FlowNode {
    const openPullRequest = createNodeOfType("git", "open_pr", gridPosition(4, 1));

    return {
        ...openPullRequest,
        label: "Abrir PR",
        config: { ...openPullRequest.config, action: "open_pr", bodyFrom: "inputs.summary" },
    };
}

function buildDoneOutputNode(): FlowNode {
    const output = createNodeOfType("output", "output", gridPosition(4, 2));

    return { ...output, config: { ...output.config, moveItemTo: "done" } };
}

function buildNeedsHumanOutputNode(): FlowNode {
    const output = createNodeOfType("output", "needs_human", gridPosition(5, 1));

    return {
        ...output,
        label: "Precisa de humano",
        config: { ...output.config, moveItemTo: "needs_human" },
    };
}

function buildLoopDeveloperNode(): FlowNode {
    const developer = createNodeOfType("agent", "dev", gridPosition(2));

    return {
        ...developer,
        label: "Desenvolver",
        inputs: [...developer.inputs, { name: "notes", type: "text", required: false }],
        config: {
            ...developer.config,
            prompt: "Implemente a issue #{{item.number}}. Comentários da revisão:\n{{inputs.notes}}",
        },
    };
}

function buildTestsScriptNode(): FlowNode {
    const tests = createNodeOfType("script", "tests", gridPosition(3));

    return { ...tests, label: "Testes", config: { ...tests.config, command: "npm run test" } };
}

function buildLoopReviewerNode(): FlowNode {
    const reviewer = createNodeOfType("agent", "review", gridPosition(4));

    return {
        ...reviewer,
        label: "Revisar",
        inputs: [...reviewer.inputs, { name: "tests", type: "json", required: true }],
        config: {
            ...reviewer.config,
            prompt: "Revise a issue #{{item.number}} com o resultado dos testes:\n{{inputs.tests}}",
            outputSchema: REVIEWER_OUTPUT_SCHEMA,
        },
    };
}

function buildReviewLoopGroup(parentGroupId: string): FlowGroup {
    return {
        id: "review_loop",
        kind: "loop",
        label: "Revisar até aprovar",
        parentGroupId,
        ...frameColumns(LOOP_COLUMNS, LOOP_GROUP_PADDING_PX),
        config: {
            maxIterations: 3,
            until: { op: "eq", path: "nodes.revisar.approved", value: true },
            carry: ["notes"],
        },
    };
}

interface ColumnSpan {
    first: number;
    count: number;
}

function buildMapGroup(group: {
    id: string;
    label: string;
    columns: ColumnSpan;
    concurrency: number;
}): FlowGroup {
    return {
        id: group.id,
        kind: "map",
        label: group.label,
        ...frameColumns(group.columns, MAP_GROUP_PADDING_PX),
        config: { concurrency: group.concurrency, barrier: false, failFast: false },
    };
}

function frameColumns(
    columns: ColumnSpan,
    paddingPx: number,
): Pick<FlowGroup, "position" | "size"> {
    const topLeft = gridPosition(columns.first);

    return {
        position: { x: topLeft.x - paddingPx, y: topLeft.y - paddingPx },
        size: {
            width: columns.count * GRID_STEP_PX + 2 * paddingPx,
            height: ROWS_PER_GROUP * NODE_HEIGHT_PX + 2 * paddingPx,
        },
    };
}

export function createNodeOfType<Type extends NodeType>(
    type: Type,
    id: string,
    position: Position,
): NodeOfType<Type> {
    const node = createDefaultNode(type, id, position);
    if (!isNodeOfType(node, type)) {
        throw new Error(`createDefaultNode("${type}") returned a ${node.type} node`);
    }

    return node;
}

function gridPosition(column: number, row = 0): Position {
    return { x: column * GRID_STEP_PX, y: row * NODE_HEIGHT_PX };
}
