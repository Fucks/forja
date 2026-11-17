import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import type { Mock } from "vitest";

import { findNode } from "@/engine/graph_queries.js";
import { isNodeOfType, NODE_TYPES } from "@/shared/flow_graph.js";
import type { FlowGraph, FlowNode, NodeOfType, NodeType } from "@/shared/flow_graph.js";
import {
    buildCanonicalFlow,
    connect,
    createNodeOfType,
} from "@/test/factories/flow_graph_factory.js";
import { buildRunListItem } from "@/test/factories/run_list_item_factory.js";
import {
    buildSerializedNodeRun,
    buildSerializedRunView,
} from "@/test/factories/run_view_factory.js";
import { stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import { renderWithQueryClient } from "@/test/render_with_query_client.js";
import { inspectorRegistry } from "@/web/canvas/inspector/inspector_registry.js";
import type { InspectorComponent } from "@/web/canvas/inspector/inspector_registry.js";
import { ConditionInspector } from "@/web/canvas/inspector/condition_inspector.js";
import { GateInspector } from "@/web/canvas/inspector/gate_inspector.js";
import { GitInspector } from "@/web/canvas/inspector/git_inspector.js";
import { OutputInspector } from "@/web/canvas/inspector/output_inspector.js";
import { ScriptInspector } from "@/web/canvas/inspector/script_inspector.js";
import { SourceInspector } from "@/web/canvas/inspector/source_inspector.js";
import { TriggerInspector } from "@/web/canvas/inspector/trigger_inspector.js";
import { getNodeDoc } from "@/web/docs/node_docs/node_docs.js";

type NodeUpdate = (node: FlowNode) => FlowNode;
type NodeChangeSpy = Mock<(update: NodeUpdate) => void>;

const GRAPH = buildCanonicalFlow();
const ORIGIN = { x: 0, y: 0 };
const PROJECT_ID = "forja";
const FLOW_ID = "flow";
const RECENT_RUNS_ROUTE = `GET /api/projects/${PROJECT_ID}/runs?limit=5&flowId=${FLOW_ID}`;
const DECISION_AFTER_REVIEWER: FlowNode = {
    ...createNodeOfType("condition", "decision", ORIGIN),
    parentGroupId: "review_and_open_pr",
};
const GRAPH_WITH_DECISION: FlowGraph = {
    ...GRAPH,
    nodes: [...GRAPH.nodes, DECISION_AFTER_REVIEWER],
    edges: [...GRAPH.edges, connect(["reviewer", "result"], ["decision", "value"])],
};

beforeEach(() => {
    localStorage.clear();
});

describe("SourceInspector", () => {
    it("applies a limit within 1 and 100", async () => {
        const source = createNodeOfType("source", "source", ORIGIN);
        const inspector = renderInspector(SourceInspector, source);

        await replaceFieldText(screen.getByRole("spinbutton", { name: "Máximo de itens" }), "10");

        expect(inspector.lastChangedNode("source").config.limit).toBe(10);
    });

    it.each(["0", "101"])("refuses the limit %s and keeps the node unchanged", async (limit) => {
        const source = createNodeOfType("source", "source", ORIGIN);
        const inspector = renderInspector(SourceInspector, source);

        await replaceFieldText(screen.getByRole("spinbutton", { name: "Máximo de itens" }), limit);

        expect(screen.getByText("Use um número inteiro entre 1 e 100.")).toBeInTheDocument();
        expect(inspector.onChange).not.toHaveBeenCalled();
    });

    it("stops skipping blocked issues", async () => {
        const source = createNodeOfType("source", "source", ORIGIN);
        const inspector = renderInspector(SourceInspector, source);

        await userEvent.click(screen.getByRole("switch", { name: "Pular bloqueadas" }));

        expect(inspector.lastChangedNode("source").config.skipBlocked).toBe(false);
    });
});

describe("ScriptInspector", () => {
    it("applies the typed command when the field loses focus", async () => {
        const script = createNodeOfType("script", "tests", ORIGIN);
        const inspector = renderInspector(ScriptInspector, script);

        await replaceFieldText(screen.getByRole("textbox", { name: "Comando" }), "npm test");

        expect(inspector.lastChangedNode("script").config.command).toBe("npm test");
    });

    it("tells that the command runs inside the item container", () => {
        const script = createNodeOfType("script", "tests", ORIGIN);

        renderInspector(ScriptInspector, script);

        expect(screen.getByText("roda dentro do container do item")).toBeInTheDocument();
    });

    it("applies a new timeout", async () => {
        const script = createNodeOfType("script", "tests", ORIGIN);
        const inspector = renderInspector(ScriptInspector, script);

        await replaceFieldText(
            screen.getByRole("spinbutton", { name: "Tempo máximo (minutos)" }),
            "5",
        );

        expect(inspector.lastChangedNode("script").config.timeoutMinutes).toBe(5);
    });
});

describe("GateInspector", () => {
    it("stops showing the logs and keeps the other sections", async () => {
        const gate = createNodeOfType("gate", "gate", ORIGIN);
        const inspector = renderInspector(GateInspector, gate);

        await userEvent.click(screen.getByRole("switch", { name: "Mostrar logs" }));

        expect(inspector.lastChangedNode("gate").config.show).toEqual(["diff", "artifacts"]);
    });

    it("applies an optional timeout in hours", async () => {
        const gate = createNodeOfType("gate", "gate", ORIGIN);
        const inspector = renderInspector(GateInspector, gate);

        await replaceFieldText(screen.getByRole("spinbutton", { name: "Prazo (horas)" }), "24");

        expect(inspector.lastChangedNode("gate").config.timeoutHours).toBe(24);
    });

    it("applies the typed message", async () => {
        const gate = createNodeOfType("gate", "gate", ORIGIN);
        const inspector = renderInspector(GateInspector, gate);

        await replaceFieldText(screen.getByRole("textbox", { name: "Mensagem" }), "Confira o PR");

        expect(inspector.lastChangedNode("gate").config.message).toBe("Confira o PR");
    });
});

describe("GitInspector", () => {
    it("chooses the push action", async () => {
        const git = createNodeOfType("git", "git", ORIGIN);
        const inspector = renderInspector(GitInspector, git);

        await userEvent.click(screen.getByRole("radio", { name: /^Push/ }));

        expect(inspector.lastChangedNode("git").config.action).toBe("push");
    });

    it("takes the PR body from the chosen input port", async () => {
        const git = createNodeOfType("git", "git", ORIGIN);
        const inspector = renderInspector(GitInspector, git);

        await userEvent.click(screen.getByRole("combobox", { name: "Texto do PR vem de" }));
        await userEvent.click(screen.getByRole("option", { name: "body" }));

        expect(inspector.lastChangedNode("git").config.bodyFrom).toBe("body");
    });

    it("falls back to the project base branch when the field is cleared", async () => {
        const git = createNodeOfType("git", "git", ORIGIN);
        const gitWithBranch = { ...git, config: { ...git.config, baseBranch: "main" } };
        const inspector = renderInspector(GitInspector, gitWithBranch);

        await userEvent.clear(screen.getByRole("textbox", { name: "Branch base" }));
        await userEvent.tab();

        expect(inspector.lastChangedNode("git").config.baseBranch).toBeUndefined();
    });

    it("opens the PR as a draft", async () => {
        const git = createNodeOfType("git", "git", ORIGIN);
        const inspector = renderInspector(GitInspector, git);

        await userEvent.click(screen.getByRole("switch", { name: "Rascunho" }));

        expect(inspector.lastChangedNode("git").config.draft).toBe(true);
    });
});

describe("OutputInspector", () => {
    it("moves the item to 'Precisa de humano'", async () => {
        const output = createNodeOfType("output", "done", ORIGIN);
        const inspector = renderInspector(OutputInspector, output);

        await userEvent.click(screen.getByRole("radio", { name: /^Precisa de humano/ }));

        expect(inspector.lastChangedNode("output").config.moveItemTo).toBe("needs_human");
    });

    it("leaves the item where it is when 'Não mover' is chosen", async () => {
        const output = createNodeOfType("output", "done", ORIGIN);
        const outputMovingItem: NodeOfType<"output"> = {
            ...output,
            config: { ...output.config, moveItemTo: "done" },
        };
        const inspector = renderInspector(OutputInspector, outputMovingItem);

        await userEvent.click(screen.getByRole("radio", { name: /^Não mover/ }));

        expect(inspector.lastChangedNode("output").config.moveItemTo).toBeUndefined();
    });

    it("comments on the issue", async () => {
        const output = createNodeOfType("output", "done", ORIGIN);
        const inspector = renderInspector(OutputInspector, output);

        await userEvent.click(screen.getByRole("switch", { name: "Comentar na issue" }));

        expect(inspector.lastChangedNode("output").config.commentOnIssue).toBe(true);
    });
});

describe("TriggerInspector", () => {
    it("shows the trigger kind", () => {
        const trigger = createNodeOfType("trigger", "trigger", ORIGIN);

        renderInspector(TriggerInspector, trigger);

        expect(screen.getByText("manual")).toBeInTheDocument();
    });

    it("links to the triggers page of the project", () => {
        const trigger = createNodeOfType("trigger", "trigger", ORIGIN);

        renderInspector(TriggerInspector, trigger);

        expect(screen.getByRole("link", { name: "Configurar gatilhos" })).toHaveAttribute(
            "href",
            "/projects/forja/triggers",
        );
    });
});

describe("ConditionInspector", () => {
    it("writes the edited rules into the condition config", async () => {
        const condition = createNodeOfType("condition", "approved", ORIGIN);
        const inspector = renderInspector(ConditionInspector, condition);

        await userEvent.click(screen.getByRole("button", { name: "Adicionar regra" }));
        await userEvent.click(screen.getByRole("button", { name: "Caminho da regra 2" }));
        await userEvent.click(screen.getByRole("button", { name: "Digitar caminho" }));
        await userEvent.type(
            screen.getByRole("textbox", { name: "Caminho da regra 2" }),
            "review.notes",
        );
        await userEvent.click(screen.getByRole("combobox", { name: "Operador da regra 2" }));
        await userEvent.click(screen.getByRole("option", { name: "existe" }));

        expect(inspector.lastChangedNode("condition").config.condition).toEqual({
            op: "and",
            conditions: [
                { op: "eq", path: "inputs.value.approved", value: true },
                { op: "exists", path: "review.notes" },
            ],
        });
    });

    it("lists the reviewer result fields for a decision after the reviewer", async () => {
        stubFetchRoutes({ [RECENT_RUNS_ROUTE]: () => Response.json([]) });
        renderInspector(ConditionInspector, DECISION_AFTER_REVIEWER, GRAPH_WITH_DECISION);

        await userEvent.click(screen.getByRole("button", { name: "Caminho da regra 1" }));

        expect(
            screen.getByRole("treeitem", { name: "Reviewer › Resultado › approved (sim/não)" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("treeitem", { name: "Reviewer › Resultado › notes (texto)" }),
        ).toBeInTheDocument();
    });

    it("shows the value each field had in the last run", async () => {
        const lastRun = buildRunListItem({ id: "run-8", flowId: FLOW_ID });
        const reviewerRun = buildSerializedNodeRun({
            runId: lastRun.id,
            nodeId: "reviewer",
            outputs: { result: { approved: true, notes: "Tudo certo" } },
        });
        stubFetchRoutes({
            [RECENT_RUNS_ROUTE]: () => Response.json([lastRun]),
            [`GET /api/runs/${lastRun.id}`]: () =>
                Response.json(buildSerializedRunView({ nodeRuns: [reviewerRun] })),
        });
        renderInspector(ConditionInspector, DECISION_AFTER_REVIEWER, GRAPH_WITH_DECISION);

        await userEvent.click(screen.getByRole("button", { name: "Caminho da regra 1" }));

        const notesRow = screen.getByRole("treeitem", {
            name: "Reviewer › Resultado › notes (texto)",
        });
        expect(await within(notesRow).findByText("Tudo certo")).toBeInTheDocument();
    });

    it("keeps the test with the last run off until the flow runs once", async () => {
        stubFetchRoutes({ [RECENT_RUNS_ROUTE]: () => Response.json([]) });
        renderInspector(ConditionInspector, DECISION_AFTER_REVIEWER, GRAPH_WITH_DECISION);

        const testButton = screen.getByRole("button", { name: "Testar com o último run" });
        await userEvent.hover(testButton.parentElement ?? testButton);

        expect(testButton).toBeDisabled();
        expect(await screen.findByRole("tooltip")).toHaveTextContent(
            "Rode o fluxo uma vez para testar com dados reais",
        );
    });

    it("tests the rule with the data of the last run and shows the branch it takes", async () => {
        const lastRun = buildRunListItem({ id: "run_01JREVIEW8", flowId: FLOW_ID });
        const reviewerRun = buildSerializedNodeRun({
            id: "reviewer-run",
            runId: lastRun.id,
            nodeId: "reviewer",
            workItemId: "itm_42",
            outputs: { result: { approved: false, notes: "Faltam testes" } },
        });
        const decisionRun = buildSerializedNodeRun({
            id: "decision-run",
            runId: lastRun.id,
            nodeId: DECISION_AFTER_REVIEWER.id,
            workItemId: "itm_42",
            inputs: { value: { approved: false, notes: "Faltam testes" } },
        });
        const runView = buildSerializedRunView({ nodeRuns: [reviewerRun, decisionRun] });
        stubFetchRoutes({
            [RECENT_RUNS_ROUTE]: () => Response.json([lastRun]),
            [`GET /api/runs/${lastRun.id}`]: () =>
                Response.json({ ...runView, run: { ...runView.run, id: lastRun.id } }),
        });
        renderInspector(ConditionInspector, DECISION_AFTER_REVIEWER, GRAPH_WITH_DECISION);

        const getTestButton = () => screen.getByRole("button", { name: "Testar com o último run" });
        await waitFor(() => expect(getTestButton()).toBeEnabled());
        await userEvent.click(getTestButton());

        expect(screen.getByRole("status")).toHaveTextContent(
            "Run #JREVIEW8 · item #itm_42: approved = false → Não",
        );
    });
});

describe("inspectorRegistry", () => {
    it.each(NODE_TYPES)("has an inspector for %s nodes", (type) => {
        expect(inspectorRegistry[type]).toBeDefined();
    });
});

describe.each(NODE_TYPES)("the %s inspector", (type) => {
    const doc = getNodeDoc(type);

    it("has a header with the editable label, the title, the tagline and the documentation", () => {
        const node = createNodeOfType(type, "node", ORIGIN);

        renderInspector(inspectorRegistry[type], node);

        expect(screen.getByRole("textbox", { name: "Rótulo" })).toHaveValue(node.label);
        expect(screen.getByText(doc.tagline).closest("p")).toHaveTextContent(doc.title);
        expect(screen.getByRole("button", { name: "Documentação" })).toBeInTheDocument();
    });

    it("has the ⓘ help on its fields", () => {
        renderInspector(inspectorRegistry[type], createNodeOfType(type, "node", ORIGIN));

        expect(screen.getAllByRole("button", { name: /^Ajuda sobre / }).length).toBeGreaterThan(0);
    });

    it("shows the node documentation in the Ajuda tab", async () => {
        renderInspector(inspectorRegistry[type], createNodeOfType(type, "node", ORIGIN));

        await userEvent.click(screen.getByRole("tab", { name: "Ajuda" }));

        const helpPanel = screen.getByRole("tabpanel", { name: "Ajuda" });
        expect(within(helpPanel).getByRole("heading", { name: doc.title })).toBeInTheDocument();
        expect(within(helpPanel).getByRole("heading", { name: "O que faz" })).toBeInTheDocument();
    });
});

describe("the Dados tab of the Reviewer", () => {
    it("shows where each input comes from", async () => {
        stubFetchRoutes({ [RECENT_RUNS_ROUTE]: () => Response.json([]) });
        renderInspector(inspectorRegistry.agent, requireNode("reviewer"));

        await userEvent.click(screen.getByRole("tab", { name: "Dados" }));

        const inputs = within(screen.getByRole("list", { name: "Entradas" })).getAllByRole(
            "listitem",
        );
        expect(inputs.map((input) => input.textContent)).toEqual(
            expect.arrayContaining(["context ← Dev › Resumo em texto", "item automático"]),
        );
    });

    it("lists the outputs with their label, type and description", async () => {
        stubFetchRoutes({ [RECENT_RUNS_ROUTE]: () => Response.json([]) });
        renderInspector(inspectorRegistry.agent, requireNode("reviewer"));

        await userEvent.click(screen.getByRole("tab", { name: "Dados" }));

        const outputs = screen.getByRole("list", { name: "Saídas" });
        expect(outputs).toHaveTextContent("Resumo em texto");
        expect(outputs).toHaveTextContent("text");
        expect(outputs).toHaveTextContent("A última mensagem do agente.");
    });

    it("asks to run the flow when the node never ran", async () => {
        stubFetchRoutes({ [RECENT_RUNS_ROUTE]: () => Response.json([]) });
        renderInspector(inspectorRegistry.agent, requireNode("reviewer"));

        await userEvent.click(screen.getByRole("tab", { name: "Dados" }));

        expect(
            await screen.findByText(
                "Ainda não há execução deste nó. Rode o fluxo para ver dados reais aqui.",
            ),
        ).toBeInTheDocument();
    });

    it("shows the inputs and outputs of the last run of the node", async () => {
        const lastRun = buildRunListItem({ id: "run-7", flowId: FLOW_ID });
        const reviewerRun = buildSerializedNodeRun({
            runId: lastRun.id,
            nodeId: "reviewer",
            inputs: { context: "Resumo do Dev" },
            outputs: { summary: "Aprovado" },
        });
        stubFetchRoutes({
            [RECENT_RUNS_ROUTE]: () => Response.json([lastRun]),
            [`GET /api/runs/${lastRun.id}`]: () =>
                Response.json(buildSerializedRunView({ nodeRuns: [reviewerRun] })),
        });
        renderInspector(inspectorRegistry.agent, requireNode("reviewer"));

        await userEvent.click(screen.getByRole("tab", { name: "Dados" }));

        expect(await screen.findByText(/"context": "Resumo do Dev"/)).toBeInTheDocument();
        expect(screen.getByText(/"summary": "Aprovado"/)).toBeInTheDocument();
    });
});

describe("every inspector", () => {
    it("opens the node documentation in a drawer", async () => {
        renderInspector(ScriptInspector, createNodeOfType("script", "tests", ORIGIN));

        await userEvent.click(screen.getByRole("button", { name: "Documentação" }));

        const drawer = screen.getByRole("dialog", { name: "Documentação do nó" });
        expect(within(drawer).getByRole("heading", { name: "Comando" })).toBeInTheDocument();
    });

    it("renames the node when the label loses focus", async () => {
        const script = createNodeOfType("script", "tests", ORIGIN);
        const inspector = renderInspector(ScriptInspector, script);

        await replaceFieldText(screen.getByRole("textbox", { name: "Rótulo" }), "Testes");

        expect(inspector.lastChangedNode("script").label).toBe("Testes");
    });
});

interface RenderedInspector {
    onChange: NodeChangeSpy;
    lastChangedNode: <Type extends NodeType>(type: Type) => NodeOfType<Type>;
}

function renderInspector(
    Inspector: InspectorComponent,
    node: FlowNode,
    graph: FlowGraph = GRAPH,
): RenderedInspector {
    const onChange: NodeChangeSpy = vi.fn();
    renderWithQueryClient(
        <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/flows/${FLOW_ID}`]}>
            <Routes>
                <Route
                    path="/projects/:projectId/flows/:flowId"
                    element={<Inspector node={node} graph={graph} onChange={onChange} />}
                />
            </Routes>
        </MemoryRouter>,
    );

    return {
        onChange,
        lastChangedNode: (type) => requireNodeOfType(applyLastUpdate(onChange, node), type),
    };
}

async function replaceFieldText(field: HTMLElement, text: string): Promise<void> {
    await userEvent.clear(field);
    await userEvent.type(field, text);
    await userEvent.tab();
}

function applyLastUpdate(onChange: NodeChangeSpy, node: FlowNode): FlowNode {
    const lastCall = onChange.mock.lastCall;
    if (!lastCall) {
        throw new Error("The inspector did not change the node");
    }

    return lastCall[0](node);
}

function requireNode(nodeId: string): FlowNode {
    const node = findNode(GRAPH, nodeId);
    if (!node) {
        throw new Error(`Node ${nodeId} not found`);
    }

    return node;
}

function requireNodeOfType<Type extends NodeType>(node: FlowNode, type: Type): NodeOfType<Type> {
    if (!isNodeOfType(node, type)) {
        throw new Error(`Node ${node.id} is not a ${type} node`);
    }

    return node;
}
