import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import type { Mock } from "vitest";

import { isNodeOfType, NODE_TYPES } from "@/shared/flow_graph.js";
import type { FlowGraph, FlowNode, NodeOfType, NodeType } from "@/shared/flow_graph.js";
import {
    buildCanonicalFlow,
    connect,
    createNodeOfType,
} from "@/test/factories/flow_graph_factory.js";
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
        await userEvent.type(
            screen.getByRole("combobox", { name: "Caminho da regra 2" }),
            "review.notes",
        );
        await userEvent.click(
            within(screen.getByRole("group", { name: "Regra 2" })).getByRole("radio", {
                name: "existe",
            }),
        );

        expect(inspector.lastChangedNode("condition").config.condition).toEqual({
            op: "and",
            conditions: [
                { op: "eq", path: "approved", value: true },
                { op: "exists", path: "review.notes" },
            ],
        });
    });

    it("suggests the outputs of the nodes upstream", () => {
        const condition = createNodeOfType("condition", "approved", ORIGIN);
        const graph = {
            ...GRAPH,
            nodes: [...GRAPH.nodes, condition],
            edges: [...GRAPH.edges, connect(["tl", "result"], ["approved", "value"])],
        };

        renderInspector(ConditionInspector, condition, graph);

        const suggestions = screen.getAllByRole("option", { hidden: true });

        expect(suggestions.map((option) => option.getAttribute("value"))).toContain("tl.result");
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
        <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/flows/flow`]}>
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

function requireNodeOfType<Type extends NodeType>(node: FlowNode, type: Type): NodeOfType<Type> {
    if (!isNodeOfType(node, type)) {
        throw new Error(`Node ${node.id} is not a ${type} node`);
    }

    return node;
}
