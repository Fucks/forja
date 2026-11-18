import type { FlowTemplate } from "@/server/flows/templates/flow_template_registry.js";
import {
    buildLoopGroup,
    buildMapGroup,
    createTemplateNode,
    placeInGroup,
} from "@/server/flows/templates/template_layout.js";
import {
    buildDeveloperAgent,
    buildDoneOutput,
    buildManualTrigger,
    buildOpenPullRequest,
    buildOutput,
    buildReviewerAgent,
    buildSandcastleIssuesSource,
    connect,
    connectPullRequestToDoneOutput,
} from "@/server/flows/templates/template_nodes.js";
import { LOOP_EXHAUSTED_PORT } from "@/shared/flow_graph.js";
import type { FlowGraph, FlowGroup, FlowNode, Port } from "@/shared/flow_graph.js";
import { nodeSlug } from "@/shared/node_slug.js";

const REVIEWER_LABEL = "Reviewer";
const MAX_REVIEW_ROUNDS = 3;
const ITEMS_IN_PARALLEL = 2;
const TEST_COMMAND = "npm test";

// Reviewer's notes come back to Dev through the branch history (see reviewer.md): the carried
// value is empty on the first round, so Dev's prompt cannot use it.
const REVIEW_NOTES_INPUT: Port = { name: "notes", type: "text", required: false };
// Edges are the only ordering between nodes: the tests wait for the approval, the PR for the tests.
const APPROVED_REVIEW_INPUT: Port = { name: "review", type: "text", required: false };
const PASSED_TESTS_INPUT: Port = { name: "tests", type: "json", required: false };

export const reviewLoopTemplate: FlowTemplate = {
    id: "review_loop",
    name: "Revisão com volta",
    description:
        "Para cada issue, o Dev implementa e o Reviewer decide: reprovado, volta para o Dev " +
        `(até ${MAX_REVIEW_ROUNDS} voltas); aprovado, roda \`${TEST_COMMAND}\` e abre o PR. ` +
        "Sem aprovação, vai para “Precisa de humano”.",
    build: buildReviewLoop,
};

function buildReviewLoop(): FlowGraph {
    const itemsGroup = buildMapGroup({
        id: "items",
        label: "Por item",
        columns: { first: 2, count: 5 },
        config: { concurrency: ITEMS_IN_PARALLEL },
    });
    const reviewLoop = buildReviewRoundsGroup(itemsGroup);

    return {
        schemaVersion: 2,
        nodes: [
            buildManualTrigger(),
            buildSandcastleIssuesSource(),
            placeInGroup(buildDeveloper(), reviewLoop),
            placeInGroup(buildReviewer(), reviewLoop),
            placeInGroup(buildTestsCommand(), itemsGroup),
            placeInGroup(buildPullRequestAfterTests(), itemsGroup),
            placeInGroup(buildDoneOutput({ column: 6 }), itemsGroup),
            placeInGroup(buildNeedsHumanOutput(), itemsGroup),
        ],
        edges: [
            connect(["trigger", "items"], ["source", "trigger"]),
            connect(["source", "items"], ["dev", "item"]),
            connect(["dev", "summary"], ["reviewer", "context"]),
            connect(["reviewer", "summary"], ["dev", REVIEW_NOTES_INPUT.name]),
            connect(["reviewer", "summary"], ["tests", APPROVED_REVIEW_INPUT.name]),
            connect(["tests", "result"], ["open_pr", PASSED_TESTS_INPUT.name]),
            connect(["reviewer", "summary"], ["open_pr", "body"]),
            connectPullRequestToDoneOutput(),
            connect([reviewLoop.id, LOOP_EXHAUSTED_PORT], ["needs_human", "item"]),
        ],
        groups: [itemsGroup, reviewLoop],
    };
}

function buildReviewRoundsGroup(itemsGroup: FlowGroup): FlowGroup {
    return buildLoopGroup({
        id: "review_loop",
        label: "Revisar até aprovar",
        parentGroupId: itemsGroup.id,
        columns: { first: 2, count: 2 },
        config: {
            maxIterations: MAX_REVIEW_ROUNDS,
            until: {
                op: "eq",
                path: `nodes.${nodeSlug(REVIEWER_LABEL)}.result.approved`,
                value: true,
            },
            carry: [REVIEW_NOTES_INPUT.name],
        },
    });
}

function buildDeveloper(): FlowNode {
    return buildDeveloperAgent({
        id: "dev",
        label: "Dev",
        cell: { column: 2 },
        extraInput: REVIEW_NOTES_INPUT,
    });
}

function buildReviewer(): FlowNode {
    return buildReviewerAgent({
        id: nodeSlug(REVIEWER_LABEL),
        label: REVIEWER_LABEL,
        cell: { column: 3 },
    });
}

function buildTestsCommand(): FlowNode {
    const tests = createTemplateNode("script", "tests", { column: 4 });

    return {
        ...tests,
        label: "Testes",
        inputs: [...tests.inputs, APPROVED_REVIEW_INPUT],
        config: { ...tests.config, command: TEST_COMMAND, onFailure: "fail" },
    };
}

function buildPullRequestAfterTests(): FlowNode {
    const openPullRequest = buildOpenPullRequest({ column: 5 });

    return { ...openPullRequest, inputs: [...openPullRequest.inputs, PASSED_TESTS_INPUT] };
}

function buildNeedsHumanOutput(): FlowNode {
    return buildOutput({
        id: "needs_human",
        label: "Precisa de humano",
        cell: { column: 6, row: 2 },
        moveItemTo: "needs_human",
    });
}
