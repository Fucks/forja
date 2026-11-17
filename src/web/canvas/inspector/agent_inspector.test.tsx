import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { Mock } from "vitest";

import { findNode } from "@/engine/graph_queries.js";
import type { CredentialSummary } from "@/shared/credential_types.js";
import { isNodeOfType } from "@/shared/flow_graph.js";
import type { FlowNode, NodeOfType } from "@/shared/flow_graph.js";
import type { AgentConfig } from "@/shared/node_configs/agent_config.js";
import type { ToolProfile } from "@/shared/tool_profile_types.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import { renderWithQueryClient } from "@/test/render_with_query_client.js";
import { AgentInspector } from "@/web/canvas/inspector/agent_inspector.js";

type AgentNode = NodeOfType<"agent">;
type NodeUpdate = (node: FlowNode) => FlowNode;
type NodeChangeSpy = Mock<(update: NodeUpdate) => void>;

const GRAPH = buildCanonicalFlow();

const REVIEWER_PROFILE: ToolProfile = {
    id: "tlp_revisor",
    name: "Revisor",
    description: "",
    mcpServers: [],
    allowedTools: ["Read"],
    disallowedTools: [],
    permissionMode: "bypassPermissions",
    indexCodegraphOnStart: false,
    builtin: false,
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-01T10:00:00.000Z",
};

const SUBSCRIPTION_CREDENTIAL = buildCredential({
    id: "cred_assinatura",
    name: "Assinatura",
    kind: "claude_oauth_token",
});
const GITHUB_CREDENTIAL = buildCredential({
    id: "cred_github",
    name: "GitHub",
    kind: "github_token",
});

const NESTED_SCHEMA = {
    type: "object",
    properties: { review: { type: "object", properties: { approved: { type: "boolean" } } } },
};

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

    describe("tools and credential", () => {
        it("sets the chosen tool profile on the node", async () => {
            const inspector = renderAgentInspector(requireAgent("tl"));

            await userEvent.click(screen.getByRole("combobox", { name: "Ferramentas" }));
            await userEvent.click(await screen.findByRole("option", { name: "Revisor" }));

            expect(inspector.lastChangedConfig().toolProfileId).toBe(REVIEWER_PROFILE.id);
        });

        it("returns to the project's tool profile when 'padrão do projeto' is chosen", async () => {
            const inspector = renderAgentInspector(requireAgent("tl"));

            await userEvent.click(screen.getByRole("combobox", { name: "Ferramentas" }));
            await userEvent.click(screen.getByRole("option", { name: "padrão do projeto" }));

            expect(inspector.lastChangedConfig().toolProfileId).toBeUndefined();
        });

        it("offers only the credentials that agents can use", async () => {
            const inspector = renderAgentInspector(requireAgent("tl"));

            await userEvent.click(screen.getByRole("combobox", { name: "Credencial" }));
            await userEvent.click(await screen.findByRole("option", { name: "Assinatura" }));

            expect(screen.queryByRole("option", { name: "GitHub" })).not.toBeInTheDocument();
            expect(inspector.lastChangedConfig().credentialId).toBe(SUBSCRIPTION_CREDENTIAL.id);
        });
    });

    describe("execution", () => {
        it("applies the iterations typed within the limits", async () => {
            const inspector = renderAgentInspector(requireAgent("dev"));
            const iterationsField = screen.getByRole("spinbutton", {
                name: "Repetições do prompt",
            });

            await userEvent.clear(iterationsField);
            await userEvent.type(iterationsField, "5");
            await userEvent.tab();

            expect(inspector.lastChangedConfig().maxIterations).toBe(5);
        });

        it("shows the limits and keeps the node unchanged when the value is out of range", async () => {
            const onChange = renderAgentInspector(requireAgent("dev")).onChange;
            const retriesField = screen.getByRole("spinbutton", { name: "Novas tentativas" });

            await userEvent.clear(retriesField);
            await userEvent.type(retriesField, "9");
            await userEvent.tab();

            expect(screen.getByText("Use um número inteiro entre 0 e 5.")).toBeInTheDocument();
            expect(onChange).not.toHaveBeenCalled();
        });

        it("removes the turn limit when its field is cleared", async () => {
            const inspector = renderAgentInspector(withConfig("dev", { maxTurns: 30 }));

            await userEvent.clear(screen.getByRole("spinbutton", { name: "Máximo de ações" }));
            await userEvent.tab();

            expect(inspector.lastChangedConfig().maxTurns).toBeUndefined();
        });

        it("chooses to run without a workspace", async () => {
            const inspector = renderAgentInspector(requireAgent("dev"));

            await userEvent.click(screen.getByRole("radio", { name: /^Sem workspace/ }));

            expect(inspector.lastChangedConfig().workspace).toBe("none");
        });
    });

    describe("advanced", () => {
        it.each(["Tempo máximo parado (minutos)", "Expandir comandos do prompt"])(
            "keeps %s folded in Avançado",
            (fieldLabel) => {
                renderAgentInspector(requireAgent("dev"));

                const advancedSection = requireAdvancedSection();
                expect(advancedSection).not.toHaveAttribute("open");
                expect(within(advancedSection).getByText(fieldLabel)).toBeInTheDocument();
            },
        );

        it("stops expanding the commands of the prompt", async () => {
            const inspector = renderAgentInspector(requireAgent("dev"));

            await userEvent.click(
                screen.getByRole("switch", { name: "Expandir comandos do prompt" }),
            );

            expect(inspector.lastChangedConfig().expandPromptCommands).toBe(false);
        });

        it("applies an idle timeout", async () => {
            const inspector = renderAgentInspector(requireAgent("dev"));
            const idleTimeoutField = screen.getByRole("spinbutton", {
                name: "Tempo máximo parado (minutos)",
            });

            await userEvent.clear(idleTimeoutField);
            await userEvent.type(idleTimeoutField, "5");
            await userEvent.tab();

            expect(inspector.lastChangedConfig().idleTimeoutMinutes).toBe(5);
        });
    });

    describe("input ports", () => {
        it("adds a required text port named spec", async () => {
            const inspector = renderAgentInspector(requireAgent("tl"));

            await userEvent.type(screen.getByRole("textbox", { name: "Nome da porta" }), "spec");
            await userEvent.click(screen.getByRole("button", { name: "Adicionar porta" }));

            expect(inspector.lastChangedNode().inputs).toContainEqual({
                name: "spec",
                type: "text",
                required: true,
            });
        });

        it("adds a port with the description the user wrote", async () => {
            const inspector = renderAgentInspector(requireAgent("tl"));

            await userEvent.type(screen.getByRole("textbox", { name: "Nome da porta" }), "spec");
            await userEvent.type(
                screen.getByRole("textbox", { name: "Descrição" }),
                "A especificação do TL.",
            );
            await userEvent.click(screen.getByRole("button", { name: "Adicionar porta" }));

            expect(inspector.lastChangedNode().inputs).toContainEqual({
                name: "spec",
                type: "text",
                required: true,
                description: "A especificação do TL.",
            });
        });

        it("refuses a name already used by another input", async () => {
            const onChange = renderAgentInspector(requireAgent("dev")).onChange;

            await userEvent.type(screen.getByRole("textbox", { name: "Nome da porta" }), "spec");
            await userEvent.click(screen.getByRole("button", { name: "Adicionar porta" }));

            expect(screen.getByText("Já existe uma entrada com esse nome.")).toBeInTheDocument();
            expect(onChange).not.toHaveBeenCalled();
        });

        it("refuses a name that is not a valid port name", async () => {
            const onChange = renderAgentInspector(requireAgent("tl")).onChange;

            await userEvent.type(screen.getByRole("textbox", { name: "Nome da porta" }), "Spec 2");
            await userEvent.click(screen.getByRole("button", { name: "Adicionar porta" }));

            expect(
                screen.getByText("Comece com letra minúscula e use só letras, números e _."),
            ).toBeInTheDocument();
            expect(onChange).not.toHaveBeenCalled();
        });

        it("removes the chosen port", async () => {
            const inspector = renderAgentInspector(requireAgent("dev"));

            await userEvent.click(screen.getByRole("button", { name: "Remover a entrada spec" }));

            const inputNames = inspector.lastChangedNode().inputs.map((port) => port.name);
            expect(inputNames).not.toContain("spec");
        });
    });

    describe("response format", () => {
        it("shows the fields of the reviewer in the visual editor", () => {
            renderAgentInspector(requireAgent("reviewer"));

            expect(screen.getByRole("textbox", { name: "Nome do campo 1" })).toHaveValue(
                "approved",
            );
            expect(screen.getByRole("textbox", { name: "Nome do campo 2" })).toHaveValue("notes");
        });

        it("turns a required yes/no and an optional text into a schema", async () => {
            const inspector = renderAgentInspector(requireAgent("dev"));

            await addField("approved", "sim/não");
            await userEvent.click(within(requireFieldRow(1)).getByLabelText("obrigatório"));
            await addField("notes", "texto");

            expect(inspector.lastChangedConfig().outputSchema).toEqual({
                type: "object",
                properties: { approved: { type: "boolean" }, notes: { type: "string" } },
                required: ["approved"],
            });
        });

        it("turns 'uma das opções' into an enum", async () => {
            const inspector = renderAgentInspector(requireAgent("dev"));

            await addField("kind", "uma das opções");
            await userEvent.type(
                screen.getByRole("textbox", { name: "Opções do campo 1" }),
                "bug, feature",
            );
            await userEvent.tab();

            expect(inspector.lastChangedConfig().outputSchema).toEqual({
                type: "object",
                properties: { kind: { type: "string", enum: ["bug", "feature"] } },
                required: [],
            });
        });

        it("keeps the node unchanged while a field name is invalid", async () => {
            const onChange = renderAgentInspector(requireAgent("dev")).onChange;

            await addField("2 notas", "texto");

            expect(
                screen.getByText("Use letras, números e _, sem começar por número."),
            ).toBeInTheDocument();
            expect(onChange).not.toHaveBeenCalled();
        });

        it("keeps the node unchanged while two fields share a name", async () => {
            const inspector = renderAgentInspector(requireAgent("reviewer"));

            await userEvent.clear(screen.getByRole("textbox", { name: "Nome do campo 2" }));
            await userEvent.type(
                screen.getByRole("textbox", { name: "Nome do campo 2" }),
                "approved",
            );
            await userEvent.tab();

            expect(screen.getByText("Já existe um campo com esse nome.")).toBeInTheDocument();
            expect(inspector.onChange).not.toHaveBeenCalled();
        });

        it("fills the fields with the Aprovação preset", async () => {
            const inspector = renderAgentInspector(requireAgent("dev"));

            await userEvent.click(screen.getByRole("button", { name: "Aprovação" }));

            expect(inspector.lastChangedConfig().outputSchema).toEqual({
                type: "object",
                properties: { approved: { type: "boolean" }, notes: { type: "string" } },
                required: ["approved"],
            });
        });

        it("fills the fields with the Pronto? preset", async () => {
            const inspector = renderAgentInspector(requireAgent("dev"));

            await userEvent.click(screen.getByRole("button", { name: "Pronto?" }));

            expect(inspector.lastChangedConfig().outputSchema).toEqual({
                type: "object",
                properties: { ready: { type: "boolean" } },
                required: ["ready"],
            });
        });

        it("removes the format when the last field is removed", async () => {
            const inspector = renderAgentInspector(requireAgent("tl"));

            await userEvent.click(screen.getByRole("button", { name: "Remover o campo 1" }));

            expect(inspector.lastChangedConfig().outputSchema).toBeUndefined();
        });

        it("opens a nested schema in the JSON tab with the advanced notice", () => {
            renderAgentInspector(withConfig("dev", { outputSchema: NESTED_SCHEMA }));

            expect(screen.getByRole("tab", { name: "JSON" })).toHaveAttribute(
                "aria-selected",
                "true",
            );
            expect(
                screen.getByText("Este formato é avançado demais para o editor visual."),
            ).toBeInTheDocument();
        });

        it("shows the error and keeps the node unchanged when the JSON is invalid", async () => {
            const onChange = renderAgentInspector(requireAgent("dev")).onChange;
            await openJsonTab();
            const schemaField = screen.getByRole("textbox", { name: "JSON Schema" });

            await userEvent.click(schemaField);
            await userEvent.paste('{ "type": ');
            await userEvent.tab();

            expect(screen.getByText("JSON inválido.")).toBeInTheDocument();
            expect(schemaField).toHaveAttribute("aria-invalid", "true");
            expect(onChange).not.toHaveBeenCalled();
        });

        it("rejects JSON that is not an object", async () => {
            const onChange = renderAgentInspector(requireAgent("dev")).onChange;
            await openJsonTab();

            await userEvent.click(screen.getByRole("textbox", { name: "JSON Schema" }));
            await userEvent.paste("[]");
            await userEvent.tab();

            expect(screen.getByText("O schema precisa ser um objeto JSON.")).toBeInTheDocument();
            expect(onChange).not.toHaveBeenCalled();
        });

        it("applies the example schema", async () => {
            const inspector = renderAgentInspector(requireAgent("dev"));
            await openJsonTab();

            await userEvent.click(screen.getByRole("button", { name: "Exemplo" }));

            expect(inspector.lastChangedConfig().outputSchema).toEqual({
                type: "object",
                properties: { approved: { type: "boolean" } },
            });
        });

        it("removes the schema when the JSON is cleared", async () => {
            const inspector = renderAgentInspector(requireAgent("tl"));
            await openJsonTab();

            await userEvent.clear(screen.getByRole("textbox", { name: "JSON Schema" }));
            await userEvent.tab();

            expect(inspector.lastChangedConfig().outputSchema).toBeUndefined();
        });
    });
});

async function addField(name: string, typeLabel: string): Promise<void> {
    await userEvent.click(screen.getByRole("button", { name: "Adicionar campo" }));
    const rowNumber = screen.getAllByRole("group", { name: /^Campo \d+$/ }).length;
    await userEvent.click(screen.getByRole("combobox", { name: `Tipo do campo ${rowNumber}` }));
    await userEvent.click(screen.getByRole("option", { name: typeLabel }));
    await userEvent.type(screen.getByRole("textbox", { name: `Nome do campo ${rowNumber}` }), name);
    await userEvent.tab();
}

async function openJsonTab(): Promise<void> {
    await userEvent.click(screen.getByRole("tab", { name: "JSON" }));
}

function requireFieldRow(rowNumber: number): HTMLElement {
    return screen.getByRole("group", { name: `Campo ${rowNumber}` });
}

interface RenderedInspector {
    onChange: NodeChangeSpy;
    lastChangedNode: () => FlowNode;
    lastChangedConfig: () => AgentConfig;
}

function renderAgentInspector(node: AgentNode): RenderedInspector {
    stubFetchRoutes({
        "GET /api/tool-profiles": () => Response.json([REVIEWER_PROFILE]),
        "GET /api/credentials": () => Response.json([SUBSCRIPTION_CREDENTIAL, GITHUB_CREDENTIAL]),
    });
    const onChange: NodeChangeSpy = vi.fn();
    renderWithQueryClient(<AgentInspector node={node} graph={GRAPH} onChange={onChange} />);

    return {
        onChange,
        lastChangedNode: () => applyLastUpdate(onChange, node),
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

function requireAdvancedSection(): HTMLElement {
    const advancedSection = screen.getByText("Avançado").closest("details");
    if (!advancedSection) {
        throw new Error("The inspector has no Avançado section");
    }

    return advancedSection;
}

function buildCredential(
    credential: Pick<CredentialSummary, "id" | "name" | "kind">,
): CredentialSummary {
    return {
        ...credential,
        masked: "••••1234",
        envVar: "CLAUDE_CODE_OAUTH_TOKEN",
        createdAt: "2026-11-01T10:00:00.000Z",
        updatedAt: "2026-11-01T10:00:00.000Z",
    };
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
