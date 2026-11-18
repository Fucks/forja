import {
    type AgentNode,
    availableVariables,
    checkPromptVariables,
    parsePromptTemplate,
    PromptRenderError,
    renderPrompt,
} from "@/engine/prompt_template.js";
import type { DataContext } from "@/shared/data_context.js";
import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";
import { createDefaultNode } from "@/shared/node_defaults.js";
import { buildCanonicalFlow, buildLoopFlow } from "@/test/factories/flow_graph_factory.js";

function buildPromptContext(inputs: Record<string, unknown> = {}): DataContext {
    return {
        inputs,
        nodes: { tl: { summary: "Especificação do TL" } },
        item: { id: "wi_42", title: "Login com GitHub", body: "Descrição", number: 42, labels: [] },
        project: { name: "forja", baseBranch: "development" },
        run: { id: "run_1", iteration: 2, attempt: 1 },
    };
}

describe("parsePromptTemplate", () => {
    it("splits text and variables with their positions in the template", () => {
        const tokens = parsePromptTemplate("Implemente {{item.title}} agora");

        expect(tokens).toEqual([
            { kind: "text", value: "Implemente ", start: 0, end: 11 },
            { kind: "var", value: "item.title", start: 11, end: 25 },
            { kind: "text", value: " agora", start: 25, end: 31 },
        ]);
    });

    it("accepts spaces around the variable path", () => {
        const tokens = parsePromptTemplate("{{  inputs.spec }}");

        expect(tokens).toEqual([{ kind: "var", value: "inputs.spec", start: 0, end: 18 }]);
    });

    it("keeps an escaped opening as literal text", () => {
        const tokens = parsePromptTemplate("a \\{{x}} b");

        expect(tokens).toEqual([{ kind: "text", value: "a {{x}} b", start: 0, end: 10 }]);
    });

    it("keeps an unclosed opening as literal text", () => {
        const tokens = parsePromptTemplate("faltou {{fechar");

        expect(tokens).toEqual([{ kind: "text", value: "faltou {{fechar", start: 0, end: 15 }]);
    });

    it("passes context commands through untouched", () => {
        const template = "Histórico: !`git log --oneline -5`";

        const tokens = parsePromptTemplate(template);

        expect(tokens).toEqual([{ kind: "text", value: template, start: 0, end: template.length }]);
    });

    it("returns no tokens for an empty template", () => {
        expect(parsePromptTemplate("")).toEqual([]);
    });
});

describe("renderPrompt", () => {
    it("replaces a nodes variable with the output of the node before it", () => {
        const prompt = renderPrompt("Siga: {{nodes.tl.summary}}", buildPromptContext());

        expect(prompt).toBe("Siga: Especificação do TL");
    });

    it("replaces variables with values from the context", () => {
        const prompt = renderPrompt(
            "Implemente {{item.title}} a partir de {{ project.baseBranch }}",
            buildPromptContext(),
        );

        expect(prompt).toBe("Implemente Login com GitHub a partir de development");
    });

    it("inserts strings as they are", () => {
        const prompt = renderPrompt("{{inputs.spec}}", buildPromptContext({ spec: "  # Spec\n" }));

        expect(prompt).toBe("  # Spec\n");
    });

    it("inserts numbers and booleans as text", () => {
        const context = buildPromptContext({ approved: false });

        const prompt = renderPrompt("#{{item.number}} {{inputs.approved}}", context);

        expect(prompt).toBe("#42 false");
    });

    it("inserts objects and arrays as JSON indented with two spaces", () => {
        const context = buildPromptContext({ tests: { exitCode: 0 }, files: ["a.ts"] });

        const prompt = renderPrompt("{{inputs.tests}}\n{{inputs.files}}", context);

        expect(prompt).toBe('{\n  "exitCode": 0\n}\n[\n  "a.ts"\n]');
    });

    it("inserts null as null", () => {
        const prompt = renderPrompt("{{inputs.notes}}", buildPromptContext({ notes: null }));

        expect(prompt).toBe("null");
    });

    it("keeps escaped openings and context commands literal", () => {
        const prompt = renderPrompt("\\{{x}} !`git status`", buildPromptContext());

        expect(prompt).toBe("{{x}} !`git status`");
    });

    it("throws PromptRenderError naming a variable missing from the context", () => {
        const render = () => renderPrompt("Implemente {{item.nada}}", buildPromptContext());

        expect(render).toThrow(PromptRenderError);
        expect(render).toThrow("item.nada");
    });

    it("throws PromptRenderError for a variable whose value is undefined", () => {
        const context = buildPromptContext({ notes: undefined });

        const render = () => renderPrompt("{{inputs.notes}}", context);

        expect(render).toThrow(new PromptRenderError("inputs.notes"));
    });

    it("throws PromptRenderError for item variables when the run has no item", () => {
        const context = { ...buildPromptContext(), item: undefined };

        const render = () => renderPrompt("{{item.title}}", context);

        expect(render).toThrow(PromptRenderError);
    });
});

describe("checkPromptVariables", () => {
    it("accepts a prompt that only uses available variables", () => {
        const graph = buildCanonicalFlow();

        const issues = checkPromptVariables(findAgentNode(graph, "dev"), graph);

        expect(issues).toEqual([]);
    });

    it("reports an unknown variable as an error on the node", () => {
        const graph = buildCanonicalFlow();
        const developer = findAgentNode(graph, "dev");
        const prompt = "Siga {{inputs.spec}} e {{inputs.plano}}";

        const issues = checkPromptVariables(withPrompt(developer, prompt), graph);

        expect(issues).toEqual([
            {
                level: "error",
                code: "unknown_variable",
                message: "O prompt de ‘Dev’ usa {{inputs.plano}}, que não existe.",
                fix: "Troque a variável por um dado escolhido no botão Inserir dado do prompt.",
                fieldKey: "prompt",
                target: { kind: "node", id: "dev" },
            },
        ]);
    });

    it("accepts a nodes variable of a node that comes before it", () => {
        const graph = buildCanonicalFlow();
        const developer = withPrompt(findAgentNode(graph, "dev"), "Siga {{nodes.tl.summary}}");

        const issues = checkPromptVariables(developer, graph);

        expect(issues).toEqual([]);
    });

    it("reports a nodes variable of a node that comes after it", () => {
        const graph = buildCanonicalFlow();
        const techLead = withPrompt(findAgentNode(graph, "tl"), "Veja {{nodes.dev.summary}}");

        const issues = checkPromptVariables(techLead, graph);

        expect(issues).toEqual([
            {
                level: "error",
                code: "variable_node_not_upstream",
                message:
                    "O prompt de ‘TL’ lê {{nodes.dev.summary}}, de um nó que não vem antes dele.",
                fix:
                    "Ligue esse nó antes deste ou escolha outro dado " +
                    "no botão Inserir dado do prompt.",
                fieldKey: "prompt",
                target: { kind: "node", id: "tl" },
            },
        ]);
    });

    it("reports a nodes variable of a node that does not exist", () => {
        const graph = buildCanonicalFlow();
        const developer = withPrompt(findAgentNode(graph, "dev"), "Veja {{nodes.ninguem.summary}}");

        const issues = checkPromptVariables(developer, graph);

        expect(issues.map((issue) => issue.code)).toEqual(["variable_node_not_upstream"]);
    });

    it("reports item variables in a node that has no current item", () => {
        const node = buildTopLevelAgentWithoutItemPort();
        const agent = withPrompt(asAgentNode(node), "Resolva {{item.title}}");

        const issues = checkPromptVariables(agent, graphWith(agent));

        expect(issues.map((issue) => issue.code)).toEqual(["unknown_variable"]);
    });

    it("ignores escaped openings", () => {
        const graph = buildCanonicalFlow();
        const developer = withPrompt(findAgentNode(graph, "dev"), "Use \\{{inputs.plano}}");

        const issues = checkPromptVariables(developer, graph);

        expect(issues).toEqual([]);
    });
});

describe("availableVariables", () => {
    it("lists an inputs variable for each input port of the node, typed by the port", () => {
        const graph = buildCanonicalFlow();

        const variables = availableVariables(findNode(graph, "dev"), graph);

        expect(variables).toContainEqual(
            expect.objectContaining({ path: "inputs.spec", type: "text" }),
        );
        expect(variables).toContainEqual(
            expect.objectContaining({ path: "inputs.item", type: "workItem" }),
        );
    });

    it("lists project and run variables for every node", () => {
        const node = buildTopLevelAgentWithoutItemPort();

        const paths = availablePaths(node, graphWith(node));

        expect(paths).toEqual(
            expect.arrayContaining([
                "project.name",
                "project.baseBranch",
                "project.githubRepo",
                "run.iteration",
                "run.attempt",
            ]),
        );
    });

    it("omits item variables for a node outside a map without a workItem port", () => {
        const node = buildTopLevelAgentWithoutItemPort();

        const paths = availablePaths(node, graphWith(node));

        expect(paths.filter((path) => path.startsWith("item."))).toEqual([]);
    });

    it("lists item variables for a node with a workItem port outside any map", () => {
        const node = createDefaultNode("agent", "solo", { x: 0, y: 0 });

        const paths = availablePaths(node, graphWith(node));

        expect(paths).toEqual(expect.arrayContaining(["item.title", "item.number", "item.labels"]));
    });

    it("lists item variables for a node inside a map even without a workItem port", () => {
        const graph = buildCanonicalFlow();
        const reviewer = findNode(graph, "reviewer");
        const reviewerWithoutItemPort = { ...reviewer, inputs: withoutItemPort(reviewer) };

        const paths = availablePaths(reviewerWithoutItemPort, graph);

        expect(paths).toEqual(expect.arrayContaining(["item.id", "item.title", "item.body"]));
    });

    it("lists the carried ports of an enclosing loop as inputs", () => {
        const graph = buildLoopFlow();

        const paths = availablePaths(findNode(graph, "review"), graph);

        expect(paths).toContain("inputs.notes");
    });

    it("lists a carried port only once when the node also declares it", () => {
        const graph = buildLoopFlow();

        const paths = availablePaths(findNode(graph, "dev"), graph);

        expect(paths.filter((path) => path === "inputs.notes")).toHaveLength(1);
    });

    it("lists item variables for a node in a loop nested inside a map", () => {
        const graph = buildLoopFlow();
        const tests = findNode(graph, "tests");
        const testsWithoutItemPort = { ...tests, inputs: withoutItemPort(tests) };

        const paths = availablePaths(testsWithoutItemPort, graph);

        expect(paths).toContain("item.title");
    });
});

function availablePaths(node: FlowNode, graph: FlowGraph): string[] {
    return availableVariables(node, graph).map((variable) => variable.path);
}

function findNode(graph: FlowGraph, nodeId: string): FlowNode {
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
        throw new Error(`Node ${nodeId} is not in the graph`);
    }

    return node;
}

function findAgentNode(graph: FlowGraph, nodeId: string): AgentNode {
    return asAgentNode(findNode(graph, nodeId));
}

function asAgentNode(node: FlowNode): AgentNode {
    if (node.type !== "agent") {
        throw new Error(`Node ${node.id} is a ${node.type} node`);
    }

    return node;
}

function withPrompt(agent: AgentNode, prompt: string): AgentNode {
    return { ...agent, config: { ...agent.config, prompt } };
}

function graphWith(node: FlowNode): FlowGraph {
    return { schemaVersion: 2, nodes: [node], edges: [], groups: [] };
}

function buildTopLevelAgentWithoutItemPort(): FlowNode {
    const node = createDefaultNode("agent", "solo", { x: 0, y: 0 });

    return { ...node, inputs: withoutItemPort(node) };
}

function withoutItemPort(node: FlowNode): FlowNode["inputs"] {
    return node.inputs.filter((port) => port.type !== "workItem");
}
