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
import { updateNode } from "@/test/factories/flow_graph_variations.js";
import { buildRunListItem } from "@/test/factories/run_list_item_factory.js";
import {
    buildSerializedNodeRun,
    buildSerializedRunView,
} from "@/test/factories/run_view_factory.js";
import { listSentWrites, respondWithApiError, stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import { TRIGGER_KINDS } from "@/shared/trigger_types.js";
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

describe("SourceInspector preview", () => {
    const SOURCE_PREVIEW_ROUTE = `POST /api/projects/${PROJECT_ID}/flows/${FLOW_ID}/source-preview`;
    const SANDCASTLE_SOURCE: FlowNode = {
        ...createNodeOfType("source", "source", ORIGIN),
        config: {
            provider: "github",
            label: "Sandcastle",
            state: "open",
            limit: 20,
            skipBlocked: true,
        },
    };

    async function openPreview(): Promise<HTMLElement> {
        renderInspector(SourceInspector, SANDCASTLE_SOURCE);
        await userEvent.click(
            screen.getByRole("button", { name: "Ver o que seria buscado agora" }),
        );

        return screen.getByRole("dialog", { name: "O que seria buscado agora" });
    }

    it("lists the issues the source would take now and how many were skipped", async () => {
        stubFetchRoutes({
            [SOURCE_PREVIEW_ROUTE]: () =>
                Response.json({
                    items: [{ number: 12, title: "Tela de login", labels: ["Sandcastle"] }],
                    skipped: 3,
                }),
        });

        const dialog = await openPreview();

        const items = await within(dialog).findAllByRole("listitem");
        expect(items.map((item) => item.textContent)).toEqual(["#12Tela de loginSandcastle"]);
        expect(dialog).toHaveTextContent("3 issues puladas porque dependem de issues abertas");
    });

    it("sends the config being edited", async () => {
        const fetchSpy = stubFetchRoutes({
            [SOURCE_PREVIEW_ROUTE]: () => Response.json({ items: [], skipped: 0 }),
        });

        await openPreview();

        await waitFor(() =>
            expect(listSentWrites(fetchSpy)).toEqual([
                expect.objectContaining({ body: { config: SANDCASTLE_SOURCE.config } }),
            ]),
        );
    });

    it("tells when no open issue has the label", async () => {
        stubFetchRoutes({ [SOURCE_PREVIEW_ROUTE]: () => Response.json({ items: [], skipped: 0 }) });

        const dialog = await openPreview();

        expect(
            await within(dialog).findByText("Nenhuma issue aberta com a label Sandcastle"),
        ).toBeInTheDocument();
    });

    it("shows the GitHub error with a hint about the credential", async () => {
        stubFetchRoutes({
            [SOURCE_PREVIEW_ROUTE]: () =>
                respondWithApiError(422, "Não foi possível buscar as issues do GitHub."),
        });

        const dialog = await openPreview();

        expect(await within(dialog).findByRole("alert")).toHaveTextContent(
            "Não foi possível buscar as issues do GitHub. " +
                "Verifique a credencial do GitHub em Configurações",
        );
    });

    it("explains with an example when a blocked issue is taken", () => {
        renderInspector(SourceInspector, SANDCASTLE_SOURCE);

        expect(
            screen.getByText("#12 com ‘depends on #10’ só entra quando #10 fechar"),
        ).toBeInTheDocument();
    });
});

describe("GateInspector", () => {
    it("stops showing the logs and keeps the other sections", async () => {
        const gate = createNodeOfType("gate", "gate", ORIGIN);
        const inspector = renderInspector(GateInspector, gate);

        await userEvent.click(screen.getByRole("checkbox", { name: "Logs" }));

        expect(inspector.lastChangedNode("gate").config.show).toEqual(["diff", "artifacts"]);
    });

    it("describes each section the approval can show", () => {
        renderInspector(GateInspector, createNodeOfType("gate", "gate", ORIGIN));

        expect(screen.getByRole("checkbox", { name: "Diff" })).toHaveAccessibleDescription(
            "As mudanças no código do item.",
        );
    });

    it("previews the approval screen with the message and the chosen sections", () => {
        const gate = createNodeOfType("gate", "gate", ORIGIN);
        const gateWithMessage: NodeOfType<"gate"> = {
            ...gate,
            config: { ...gate.config, message: "Confira o PR", show: ["diff", "logs"] },
        };

        renderInspector(GateInspector, gateWithMessage);

        const preview = within(screen.getByRole("figure", { name: "Prévia da tela Aprovações" }));
        expect(preview.getByText("Confira o PR")).toBeInTheDocument();
        expect(preview.getByRole("heading", { name: "Diff" })).toBeInTheDocument();
        expect(preview.getByText("Ver logs da run")).toBeInTheDocument();
        expect(preview.queryByRole("heading", { name: "Artefatos" })).not.toBeInTheDocument();
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

    it("writes the text picked for the PR body as its path", async () => {
        stubFetchRoutes({ [RECENT_RUNS_ROUTE]: () => Response.json([]) });
        const inspector = renderInspector(GitInspector, requireNode("open_pr"));

        await userEvent.click(screen.getByRole("button", { name: "Texto do PR vem de" }));
        await userEvent.click(
            screen.getByRole("treeitem", { name: "Entradas deste nó › Texto do PR (texto)" }),
        );

        expect(inspector.lastChangedNode("git").config.bodyFrom).toBe("inputs.body");
    });

    it("warns when the PR body points to an input that does not reach the node", () => {
        stubFetchRoutes({ [RECENT_RUNS_ROUTE]: () => Response.json([]) });
        const graph = withBodyFrom(GRAPH, "inputs.summary");

        renderInspector(GitInspector, requireNode("open_pr", graph), graph);

        expect(
            screen.getByText(
                "O corpo do PR aponta para ‘inputs.summary’, que não existe aqui. " +
                    "Escolha o texto no seletor.",
            ),
        ).toBeInTheDocument();
    });

    it("does not warn when the PR body comes from the connected text", () => {
        stubFetchRoutes({ [RECENT_RUNS_ROUTE]: () => Response.json([]) });

        renderInspector(GitInspector, requireNode("open_pr"));

        expect(screen.queryByText(/O corpo do PR aponta para/)).not.toBeInTheDocument();
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

    it("explains what the comment says and where its reason comes from", () => {
        renderInspector(OutputInspector, createNodeOfType("output", "done", ORIGIN));

        expect(
            screen.getByText(
                "O comentário traz o resultado da run e o link do PR. O motivo vem da primeira " +
                    "entrada com reason, notes ou failureSummary, como as notas do Reviewer.",
            ),
        ).toBeInTheDocument();
    });

    it("describes the three destinations of the item in cards", () => {
        renderInspector(OutputInspector, createNodeOfType("output", "done", ORIGIN));

        const cards = within(screen.getByRole("radiogroup", { name: "Mover o item para" }));
        expect(cards.getAllByRole("radio").map((card) => card.textContent)).toEqual([
            "ConcluídoO trabalho terminou.",
            "Precisa de humanoAlguém precisa olhar o item.",
            "Não moverO item fica onde está no board.",
        ]);
    });
});

describe("TriggerInspector", () => {
    it("describes each of the five kinds of trigger in a card", () => {
        renderInspector(TriggerInspector, createNodeOfType("trigger", "trigger", ORIGIN));

        const cards = within(screen.getByRole("radiogroup", { name: "Tipo de disparo" }));
        expect(cards.getAllByRole("radio")).toHaveLength(TRIGGER_KINDS.length);
        expect(cards.getByRole("radio", { name: /^Manual/ })).toBeChecked();
    });

    it("chooses the schedule kind", async () => {
        const trigger = createNodeOfType("trigger", "trigger", ORIGIN);
        const inspector = renderInspector(TriggerInspector, trigger);

        await userEvent.click(screen.getByRole("radio", { name: /^Agendado/ }));

        expect(inspector.lastChangedNode("trigger").config.kind).toBe("schedule");
    });

    it("links to the triggers page of the project", () => {
        const trigger = createNodeOfType("trigger", "trigger", ORIGIN);

        renderInspector(TriggerInspector, trigger);

        expect(screen.getByRole("link", { name: "Configurar em Gatilhos" })).toHaveAttribute(
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

        expect(inspector.lastChangedNode("condition").config).toEqual({
            mode: "if",
            condition: {
                op: "and",
                conditions: [
                    { op: "eq", path: "inputs.value.approved", value: true },
                    { op: "exists", path: "review.notes" },
                ],
            },
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

function withBodyFrom(graph: FlowGraph, bodyFrom: string): FlowGraph {
    return updateNode(graph, "open_pr", (node) =>
        isNodeOfType(node, "git") ? { ...node, config: { ...node.config, bodyFrom } } : node,
    );
}

function requireNode(nodeId: string, graph: FlowGraph = GRAPH): FlowNode {
    const node = findNode(graph, nodeId);
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
