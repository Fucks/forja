import type { FlowTemplate } from "@/server/flows/templates/flow_template_registry.js";
import {
    buildLoopGroup,
    buildMapGroup,
    createTemplateNode,
    placeInGroup,
} from "@/server/flows/templates/template_layout.js";
import {
    buildDeveloperAgent,
    buildManualTrigger,
    buildDoneOutput,
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

const REVIEWER_LABEL = "Revisar";
const MAX_REVIEW_ROUNDS = 3;
const ITEMS_IN_PARALLEL = 2;
const TEST_COMMAND = "npm run test";

const TEST_RESULT_SECTION = {
    title: "TEST RESULTS",
    body: [
        `The developer's branch was tested with \`${TEST_COMMAND}\`:`,
        "<test-results>",
        "{{inputs.tests}}",
        "</test-results>",
    ].join("\n\n"),
};

// The reviewer's notes come back to the developer through the branch history (see reviewer.md):
// the carried value is empty on the first round, so the developer's prompt cannot use it.
const REVIEW_NOTES_INPUT: Port = { name: "notes", type: "text", required: false };
const TEST_RESULT_INPUT: Port = { name: "tests", type: "json", required: true };
// Only orders the steps: the tests wait for the developer's changes.
const DEVELOPER_CHANGES_INPUT: Port = { name: "changes", type: "text", required: false };

export const reviewLoopTemplate: FlowTemplate = {
    id: "review_loop",
    name: "Dev ↔ Review em loop com testes",
    description:
        "Para cada issue, o Dev implementa, os testes rodam e o Reviewer revisa, " +
        `até ${MAX_REVIEW_ROUNDS} rodadas. ` +
        "Aprovada, abre o PR; sem aprovação, vai para “precisa de humano”.",
    build: buildReviewLoop,
};

function buildReviewLoop(): FlowGraph {
    const itemsGroup = buildMapGroup({
        id: "items",
        label: "Por item",
        columns: { first: 2, count: 4 },
        config: { concurrency: ITEMS_IN_PARALLEL },
    });
    const reviewLoop = buildReviewRoundsGroup(itemsGroup);

    return {
        schemaVersion: 2,
        nodes: [
            buildManualTrigger(),
            buildSandcastleIssuesSource(),
            placeInGroup(buildDeveloper(), reviewLoop),
            placeInGroup(buildTestsScript(), reviewLoop),
            placeInGroup(buildReviewer(), reviewLoop),
            placeInGroup(buildOpenPullRequest({ column: 5 }), itemsGroup),
            placeInGroup(buildDoneOutput({ column: 5, row: 1 }), itemsGroup),
            placeInGroup(buildNeedsHumanOutput(), itemsGroup),
        ],
        edges: [
            connect(["trigger", "items"], ["source", "trigger"]),
            connect(["source", "items"], ["dev", "item"]),
            connect(["dev", "summary"], ["tests", DEVELOPER_CHANGES_INPUT.name]),
            connect(["dev", "summary"], ["review", "context"]),
            connect(["tests", "result"], ["review", TEST_RESULT_INPUT.name]),
            connect(["review", "summary"], ["dev", REVIEW_NOTES_INPUT.name]),
            connect(["review", "summary"], ["open_pr", "body"]),
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
        columns: { first: 2, count: 3 },
        config: {
            maxIterations: MAX_REVIEW_ROUNDS,
            until: { op: "eq", path: `${nodeSlug(REVIEWER_LABEL)}.result.approved`, value: true },
            carry: [REVIEW_NOTES_INPUT.name],
        },
    });
}

function buildDeveloper(): FlowNode {
    return buildDeveloperAgent({
        id: "dev",
        label: "Desenvolver",
        cell: { column: 2 },
        extraInput: REVIEW_NOTES_INPUT,
    });
}

function buildTestsScript(): FlowNode {
    const tests = createTemplateNode("script", "tests", { column: 3 });

    return {
        ...tests,
        label: "Testes",
        inputs: [...tests.inputs, DEVELOPER_CHANGES_INPUT],
        config: { ...tests.config, command: TEST_COMMAND },
    };
}

function buildReviewer(): FlowNode {
    return buildReviewerAgent({
        id: "review",
        label: REVIEWER_LABEL,
        cell: { column: 4 },
        extraInput: TEST_RESULT_INPUT,
        promptSection: TEST_RESULT_SECTION,
    });
}

function buildNeedsHumanOutput(): FlowNode {
    return buildOutput({
        id: "needs_human",
        label: "Precisa de humano",
        cell: { column: 5, row: 2 },
        moveItemTo: "needs_human",
    });
}
