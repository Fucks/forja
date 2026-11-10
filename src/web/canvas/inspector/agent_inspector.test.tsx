import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { Mock } from "vitest";

import { findNode } from "@/engine/graph_queries.js";
import { isNodeOfType } from "@/shared/flow_graph.js";
import type { FlowNode, NodeOfType } from "@/shared/flow_graph.js";
import type { AgentConfig } from "@/shared/node_configs/agent_config.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import { renderWithQueryClient } from "@/test/render_with_query_client.js";
import { AgentInspector } from "@/web/canvas/inspector/agent_inspector.js";

type AgentNode = NodeOfType<"agent">;
type NodeUpdate = (node: FlowNode) => FlowNode;
type NodeChangeSpy = Mock<(update: NodeUpdate) => void>;

const GRAPH = buildCanonicalFlow();

describe("AgentInspector", () => {
    describe("effort", () => {
        it("sets the chosen effort on the node", async () => {
            const inspector = renderAgentInspector(requireAgent("tl"));

            await userEvent.click(screen.getByRole("radio", { name: "max" }));

            expect(inspector.lastChangedConfig().effort).toBe("max");
        });

        it("removes the effort from the node when 'padrão' is chosen", async () => {
            const inspector = renderAgentInspector(requireAgent("tl"));

            await userEvent.click(screen.getByRole("radio", { name: "padrão" }));

            expect(inspector.lastChangedConfig().effort).toBeUndefined();
        });
    });

    describe("model", () => {
        it("sets the chosen suggested model on the node", async () => {
            const inspector = renderAgentInspector(requireAgent("tl"));

            await userEvent.click(screen.getByRole("combobox", { name: "Modelo" }));
            await userEvent.click(screen.getByRole("option", { name: "claude-sonnet-5-5" }));

            expect(inspector.lastChangedConfig().model).toBe("claude-sonnet-5-5");
        });

        it("removes the model from the node when 'padrão do projeto' is chosen", async () => {
            const inspector = renderAgentInspector(withConfig("tl", { model: "claude-haiku-5-5" }));

            await userEvent.click(screen.getByRole("combobox", { name: "Modelo" }));
            await userEvent.click(screen.getByRole("option", { name: "padrão do projeto" }));

            expect(inspector.lastChangedConfig().model).toBeUndefined();
        });

        it("accepts a model outside the suggestions", async () => {
            const inspector = renderAgentInspector(requireAgent("tl"));

            await userEvent.click(screen.getByRole("combobox", { name: "Modelo" }));
            await userEvent.click(screen.getByRole("option", { name: "Outro modelo…" }));
            await userEvent.type(screen.getByRole("textbox", { name: "Nome do modelo" }), "opus");
            await userEvent.tab();

            expect(inspector.lastChangedConfig().model).toBe("opus");
        });

        it("shows a model outside the suggestions in its own field", () => {
            renderAgentInspector(withConfig("tl", { model: "claude-local" }));

            expect(screen.getByRole("textbox", { name: "Nome do modelo" })).toHaveValue(
                "claude-local",
            );
        });
    });

    describe("output schema", () => {
        it("shows the error and keeps the node unchanged when the JSON is invalid", async () => {
            const onChange = renderAgentInspector(requireAgent("dev")).onChange;
            const schemaField = screen.getByRole("textbox", { name: "Schema de saída" });

            await userEvent.click(schemaField);
            await userEvent.paste('{ "type": ');
            await userEvent.tab();

            expect(screen.getByText("JSON inválido.")).toBeInTheDocument();
            expect(schemaField).toHaveAttribute("aria-invalid", "true");
            expect(onChange).not.toHaveBeenCalled();
        });

        it("rejects JSON that is not an object", async () => {
            const onChange = renderAgentInspector(requireAgent("dev")).onChange;

            await userEvent.click(screen.getByRole("textbox", { name: "Schema de saída" }));
            await userEvent.paste("[]");
            await userEvent.tab();

            expect(screen.getByText("O schema precisa ser um objeto JSON.")).toBeInTheDocument();
            expect(onChange).not.toHaveBeenCalled();
        });

        it("applies the example schema", async () => {
            const inspector = renderAgentInspector(requireAgent("dev"));

            await userEvent.click(screen.getByRole("button", { name: "Exemplo" }));

            expect(inspector.lastChangedConfig().outputSchema).toEqual({
                type: "object",
                properties: { approved: { type: "boolean" } },
            });
        });

        it("removes the schema when the field is cleared", async () => {
            const inspector = renderAgentInspector(requireAgent("tl"));

            await userEvent.clear(screen.getByRole("textbox", { name: "Schema de saída" }));
            await userEvent.tab();

            expect(inspector.lastChangedConfig().outputSchema).toBeUndefined();
        });
    });
});

interface RenderedInspector {
    onChange: NodeChangeSpy;
    lastChangedConfig: () => AgentConfig;
}

function renderAgentInspector(node: AgentNode): RenderedInspector {
    stubFetchRoutes({
        "GET /api/tool-profiles": () => Response.json([]),
        "GET /api/credentials": () => Response.json([]),
    });
    const onChange: NodeChangeSpy = vi.fn();
    renderWithQueryClient(<AgentInspector node={node} graph={GRAPH} onChange={onChange} />);

    return {
        onChange,
        lastChangedConfig: () => readAgentConfig(applyLastUpdate(onChange, node)),
    };
}

function applyLastUpdate(onChange: NodeChangeSpy, node: FlowNode): FlowNode {
    const lastCall = onChange.mock.lastCall;
    if (!lastCall) {
        throw new Error("The inspector did not change the node");
    }

    return lastCall[0](node);
}

function readAgentConfig(node: FlowNode): AgentConfig {
    if (!isNodeOfType(node, "agent")) {
        throw new Error(`Node ${node.id} is not an agent`);
    }

    return node.config;
}

function withConfig(nodeId: string, changes: Partial<AgentConfig>): AgentNode {
    const agent = requireAgent(nodeId);

    return { ...agent, config: { ...agent.config, ...changes } };
}

function requireAgent(nodeId: string): AgentNode {
    const node = findNode(GRAPH, nodeId);
    if (!node || !isNodeOfType(node, "agent")) {
        throw new Error(`Agent ${nodeId} not found`);
    }

    return node;
}
