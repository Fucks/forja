import type { FlowTemplate } from "@/server/flows/templates/flow_template_registry.js";
import { buildMapGroup, placeInGroup } from "@/server/flows/templates/template_layout.js";
import {
    buildDeveloperAgent,
    buildDoneOutput,
    buildManualTrigger,
    buildOpenPullRequest,
    buildReviewerAgent,
    buildSandcastleIssuesSource,
    buildTechLeadAgent,
    connect,
    connectPullRequestToDoneOutput,
} from "@/server/flows/templates/template_nodes.js";
import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";

const SPECIFICATION_SECTION = {
    title: "SPECIFICATION",
    body: [
        "The tech lead wrote this specification for the issue; follow it.",
        "<specification>",
        "{{inputs.spec}}",
        "</specification>",
    ].join("\n\n"),
};

export const basicFactoryTemplate: FlowTemplate = {
    id: "basic_factory",
    name: "Fábrica básica",
    description:
        "Um TL especifica uma issue por vez, três Devs implementam em paralelo e um Reviewer revisa " +
        "cada branch e abre o PR.",
    build: buildBasicFactory,
};

function buildBasicFactory(): FlowGraph {
    const specifyGroup = buildMapGroup({
        id: "specify",
        label: "Especificar",
        columns: { first: 2, count: 1 },
        config: { concurrency: 1 },
    });
    const developGroup = buildMapGroup({
        id: "develop",
        label: "Desenvolver",
        columns: { first: 3, count: 1 },
        config: { concurrency: 3 },
    });
    const reviewGroup = buildMapGroup({
        id: "review_and_open_pr",
        label: "Revisar e abrir PR",
        columns: { first: 4, count: 1 },
        config: { concurrency: 1 },
    });

    return {
        schemaVersion: 2,
        nodes: [
            buildManualTrigger(),
            buildSandcastleIssuesSource(),
            placeInGroup(buildTechLead(), specifyGroup),
            placeInGroup(buildSpecifiedDeveloper(), developGroup),
            placeInGroup(buildReviewer(), reviewGroup),
            placeInGroup(buildOpenPullRequest({ column: 4, row: 1 }), reviewGroup),
            placeInGroup(buildDoneOutput({ column: 4, row: 2 }), reviewGroup),
        ],
        edges: [
            connect(["trigger", "items"], ["source", "trigger"]),
            connect(["source", "items"], ["tl", "item"]),
            connect(["tl", "summary"], ["dev", "spec"]),
            connect(["dev", "summary"], ["reviewer", "context"]),
            connect(["reviewer", "summary"], ["open_pr", "body"]),
            connectPullRequestToDoneOutput(),
        ],
        groups: [specifyGroup, developGroup, reviewGroup],
    };
}

function buildTechLead(): FlowNode {
    return buildTechLeadAgent({ id: "tl", label: "TL", cell: { column: 2 } });
}

function buildSpecifiedDeveloper(): FlowNode {
    return buildDeveloperAgent({
        id: "dev",
        label: "Dev",
        cell: { column: 3 },
        extraInput: { name: "spec", type: "text", required: true },
        promptSection: SPECIFICATION_SECTION,
    });
}

function buildReviewer(): FlowNode {
    return buildReviewerAgent({ id: "reviewer", label: "Reviewer", cell: { column: 4 } });
}
