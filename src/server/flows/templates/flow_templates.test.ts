import type { FastifyInstance } from "fastify";

import { findGroup, findNode } from "@/engine/graph_queries.js";
import { buildApp } from "@/server/app.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { NotFoundError } from "@/server/errors.js";
import { basicFactoryTemplate } from "@/server/flows/templates/basic_factory.js";
import {
    FLOW_TEMPLATES,
    findFlowTemplateOrThrow,
} from "@/server/flows/templates/flow_template_registry.js";
import { reviewLoopTemplate } from "@/server/flows/templates/review_loop.js";
import { sandcastlePipelineTemplate } from "@/server/flows/templates/sandcastle_pipeline.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { LOOP_EXHAUSTED_PORT } from "@/shared/flow_graph.js";
import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";
import type { FlowSummary } from "@/shared/flow_types.js";
import { buildCanonicalFlow, connect } from "@/test/factories/flow_graph_factory.js";
import { addEdges, updateNode } from "@/test/factories/flow_graph_variations.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { agentPromptOf, publishErrorsOf } from "@/test/flow_template_inspection.js";
import { ExecutorTestBed, TEST_GITHUB_REPO } from "@/test/executor_test_bed.js";
import { buildGithubIssue } from "@/test/factories/work_item_factory.js";
import { FakeGitHubProvider } from "@/test/fakes/fake_github_provider.js";
import { createTestAppDeps } from "@/test/test_app_deps.js";
import { createTestDb } from "@/test/test_db.js";

const PROJECT_ID = "prj_forja";
const AGENT_DURATION_MS = 60_000;

describe("FLOW_TEMPLATES", () => {
    it("lists the basic factory, the review loop and the Sandcastle pipeline", () => {
        expect(FLOW_TEMPLATES.map((template) => template.name)).toEqual([
            "Fábrica básica",
            "Dev ↔ Review em loop com testes",
            "Pipeline Sandcastle",
        ]);
    });

    it.each(FLOW_TEMPLATES)("$name builds a graph that publishes without errors", (template) => {
        const graph = template.build();

        expect(publishErrorsOf(graph)).toEqual([]);
    });

    it("gives every template its own id", () => {
        const ids = FLOW_TEMPLATES.map((template) => template.id);

        expect(new Set(ids).size).toBe(ids.length);
    });

    it("builds a new graph on every call, so a flow never shares it with the template", () => {
        const [template] = FLOW_TEMPLATES;

        expect(template?.build()).not.toBe(template?.build());
    });
});

describe("findFlowTemplateOrThrow", () => {
    it("finds a template by its id", () => {
        expect(findFlowTemplateOrThrow("review_loop")).toBe(reviewLoopTemplate);
    });

    it("rejects an unknown template id", () => {
        expect(() => findFlowTemplateOrThrow("tpl_nenhum")).toThrow(NotFoundError);
    });
});

describe("Fábrica básica template", () => {
    it("has the nodes, edges and groups of the canonical flow", () => {
        const graph = basicFactoryTemplate.build();

        expect(structureOf(graph)).toEqual(structureOf(canonicalFlowWithDoneAfterPullRequest()));
    });

    it("moves an item to done only after its pull request is opened", () => {
        const graph = basicFactoryTemplate.build();

        expect(graph.edges.map((edge) => edge.id)).toContain("open_pr.result->output.pullRequest");
    });

    it("specifies one item at a time, develops three and reviews one", () => {
        const graph = basicFactoryTemplate.build();

        expect(mapConcurrencyOf(graph, "specify")).toBe(1);
        expect(mapConcurrencyOf(graph, "develop")).toBe(3);
        expect(mapConcurrencyOf(graph, "review_and_open_pr")).toBe(1);
    });

    it("gives the developer the specification written by the TL", () => {
        const graph = basicFactoryTemplate.build();

        expect(agentPromptOf(graph, "tl")).toContain("{{item.body}}");
        expect(agentPromptOf(graph, "dev")).toContain("{{inputs.spec}}");
    });
});

describe("Fábrica básica run with the fake runtime", () => {
    const REVIEWER_SUMMARY = "Revisado: nomes mais claros e testes extras.";
    let github: FakeGitHubProvider;
    let bed: ExecutorTestBed;

    beforeEach(() => {
        github = new FakeGitHubProvider();
        bed = new ExecutorTestBed([], { github });
    });

    afterEach(() => {
        bed.close();
    });

    it("opens the pull request with the summary of the Reviewer as its body", async () => {
        github.addIssue(TEST_GITHUB_REPO, buildGithubIssue({ number: 7, labels: ["Sandcastle"] }));
        bed.git.setCommitsAhead("forja/issue-7", 1);
        bed.runtime.script({
            match: { promptIncludes: "Review the changes on branch" },
            durationMs: AGENT_DURATION_MS,
            result: { summary: REVIEWER_SUMMARY, output: { approved: true, notes: "" } },
        });

        const flowId = await bed.publishFlow(basicFactoryTemplate.build());
        const started = await bed.startRun(flowId);
        await bed.runUntilFinished(started.id);

        expect(github.createdPullRequests).toEqual([
            expect.objectContaining({ body: expect.stringContaining(REVIEWER_SUMMARY) as unknown }),
        ]);
    });
});

describe("Dev ↔ Review em loop com testes template", () => {
    it("works on two items at a time", () => {
        const graph = reviewLoopTemplate.build();

        expect(mapConcurrencyOf(graph, "items")).toBe(2);
    });

    it("repeats develop, test and review at most three times until the review approves", () => {
        const graph = reviewLoopTemplate.build();

        expect(findGroup(graph, "review_loop")).toMatchObject({
            kind: "loop",
            parentGroupId: "items",
            config: {
                maxIterations: 3,
                until: { op: "eq", path: "nodes.revisar.result.approved", value: true },
                carry: ["notes"],
            },
        });
        expect(graph.nodes.filter((node) => node.parentGroupId === "review_loop")).toMatchObject([
            { id: "dev", type: "agent", label: "Desenvolver" },
            { id: "tests", type: "script", config: { command: "npm run test" } },
            { id: "review", type: "agent", label: "Revisar" },
        ]);
    });

    it("runs the tests after the developer and reviews after the tests", () => {
        const graph = reviewLoopTemplate.build();

        expect(graph.edges.map((edge) => edge.id)).toEqual(
            expect.arrayContaining(["dev.summary->tests.changes", "tests.result->review.tests"]),
        );
    });

    it("sends the items of an exhausted loop to a human", () => {
        const graph = reviewLoopTemplate.build();

        const exhaustedEdge = graph.edges.find(
            (edge) => edge.from.nodeId === "review_loop" && edge.from.port === LOOP_EXHAUSTED_PORT,
        );
        expect(findNode(graph, exhaustedEdge?.to.nodeId ?? "")).toMatchObject({
            type: "output",
            config: { moveItemTo: "needs_human" },
        });
    });

    it("opens a pull request for approved items before moving them to done", () => {
        const graph = reviewLoopTemplate.build();

        expect(graph.edges.map((edge) => edge.id)).toEqual(
            expect.arrayContaining([
                "review.summary->open_pr.body",
                "open_pr.result->output.pullRequest",
            ]),
        );
        expect(findNode(graph, "output")).toMatchObject({ config: { moveItemTo: "done" } });
    });

    it("does not ask the developer for review notes, which are empty in the first round", () => {
        const graph = reviewLoopTemplate.build();

        expect(agentPromptOf(graph, "dev")).not.toContain("{{inputs.notes}}");
    });

    it("gives the reviewer the result of the tests", () => {
        const graph = reviewLoopTemplate.build();

        expect(agentPromptOf(graph, "review")).toContain("{{inputs.tests}}");
    });
});

describe("flow template routes", () => {
    let database: DatabaseHandle;
    let app: FastifyInstance;

    beforeEach(async () => {
        database = createTestDb();
        new ProjectRepository(database.db).insert(buildProject({ id: PROJECT_ID }));
        app = await buildApp(createTestAppDeps(database.db));
    });

    afterEach(async () => {
        await app.close();
        database.close();
    });

    function createFlowFromTemplate(
        payload: { templateId: string; name: string },
        projectId = PROJECT_ID,
    ) {
        return app.inject({
            method: "POST",
            url: `/api/projects/${projectId}/flows/from-template`,
            payload,
        });
    }

    it("lists the templates by id, name and description", async () => {
        const response = await app.inject({ method: "GET", url: "/api/flow-templates" });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual([
            {
                id: "basic_factory",
                name: "Fábrica básica",
                description: basicFactoryTemplate.description,
            },
            {
                id: "review_loop",
                name: "Dev ↔ Review em loop com testes",
                description: reviewLoopTemplate.description,
            },
            {
                id: "sandcastle_pipeline",
                name: "Pipeline Sandcastle",
                description: sandcastlePipelineTemplate.description,
            },
        ]);
    });

    it.each(FLOW_TEMPLATES)("creates a flow whose draft is the $name graph", async (template) => {
        const response = await createFlowFromTemplate({ templateId: template.id, name: "Entrega" });

        expect(response.statusCode).toBe(201);
        const flow = response.json<FlowSummary>();
        expect(flow).toMatchObject({ projectId: PROJECT_ID, name: "Entrega", draftRevision: 1 });
        const draft = await app.inject({ method: "GET", url: `/api/flows/${flow.id}/draft` });
        expect(draft.json()).toMatchObject({ graph: template.build() });
    });

    it.each(FLOW_TEMPLATES)(
        "publishes a flow created from $name without errors",
        async (template) => {
            const created = await createFlowFromTemplate({
                templateId: template.id,
                name: "Entrega",
            });

            const response = await app.inject({
                method: "POST",
                url: `/api/flows/${created.json<FlowSummary>().id}/publish`,
            });

            expect(response.statusCode).toBe(201);
            expect(response.json()).toMatchObject({ version: 1 });
        },
    );

    it("answers 404 for an unknown template", async () => {
        const response = await createFlowFromTemplate({
            templateId: "tpl_nenhum",
            name: "Entrega",
        });

        expect(response.statusCode).toBe(404);
    });

    it("answers 404 for an unknown project", async () => {
        const response = await createFlowFromTemplate(
            { templateId: "basic_factory", name: "Entrega" },
            "prj_nenhum",
        );

        expect(response.statusCode).toBe(404);
    });

    it("answers 400 when the flow has no name", async () => {
        const response = await createFlowFromTemplate({ templateId: "basic_factory", name: " " });

        expect(response.statusCode).toBe(400);
    });
});

// The canonical fixture leaves the done output unconnected; the template makes it wait for the PR.
function canonicalFlowWithDoneAfterPullRequest(): FlowGraph {
    const canonicalFlow = updateNode(buildCanonicalFlow(), "output", (output) => ({
        ...output,
        inputs: [...output.inputs, { name: "pullRequest", type: "json", required: false }],
    }));

    return addEdges(canonicalFlow, [connect(["open_pr", "result"], ["output", "pullRequest"])]);
}

// Positions and prompts belong to the template; what the engine runs must match the canonical flow.
function structureOf(graph: FlowGraph): unknown {
    return {
        nodes: graph.nodes.map(withoutLayoutAndPrompt),
        edges: graph.edges,
        groups: graph.groups.map(({ id, kind, parentGroupId, config }) => ({
            id,
            kind,
            parentGroupId,
            config,
        })),
    };
}

function withoutLayoutAndPrompt(node: FlowNode): unknown {
    const structure = {
        id: node.id,
        type: node.type,
        label: node.label,
        parentGroupId: node.parentGroupId,
        inputs: node.inputs,
        outputs: node.outputs,
    };
    if (node.type !== "agent") {
        return { ...structure, config: node.config };
    }

    return { ...structure, config: { ...node.config, prompt: undefined } };
}

function mapConcurrencyOf(graph: FlowGraph, groupId: string): number | undefined {
    const group = findGroup(graph, groupId);
    if (group?.kind !== "map") {
        return undefined;
    }

    return group.config.concurrency;
}
