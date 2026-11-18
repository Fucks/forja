import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import type { Mock } from "vitest";

import { findNode } from "@/engine/graph_queries.js";
import type { CredentialSummary } from "@/shared/credential_types.js";
import { isNodeOfType } from "@/shared/flow_graph.js";
import type { FlowNode, NodeOfType } from "@/shared/flow_graph.js";
import type { ScriptConfig } from "@/shared/node_configs/script_config.js";
import { buildLoopFlow } from "@/test/factories/flow_graph_factory.js";
import { stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import { renderWithQueryClient } from "@/test/render_with_query_client.js";
import { ScriptInspector } from "@/web/canvas/inspector/script_inspector.js";

type ScriptNode = NodeOfType<"script">;
type NodeUpdate = (node: FlowNode) => FlowNode;
type NodeChangeSpy = Mock<(update: NodeUpdate) => void>;

const GRAPH = buildLoopFlow();
const PROJECT_ID = "forja";
const FLOW_ID = "flow";
const TESTS_SCRIPT_ID = "tests";
const ITEM_REQUIRED_NOTICE = "Precisa da entrada Item atual ligada.";
const DECISION_HINT = "Ligue Resultado › passed a uma Decisão.";
const TWO_ENV_VARS = [
    { name: "FIRST", value: "1" },
    { name: "SECOND", value: "2" },
];
const NPM_CREDENTIAL: CredentialSummary = {
    id: "cred_npm",
    name: "NPM",
    kind: "generic_env",
    masked: "••••1234",
    envVar: "NPM_TOKEN",
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-01T10:00:00.000Z",
};

describe("ScriptInspector", () => {
    describe("command", () => {
        it("inserts the picked field as a variable in the command", async () => {
            const inspector = renderScriptInspector(withConfig({ command: "echo " }));

            await userEvent.click(screen.getByRole("button", { name: "Inserir dado" }));
            await userEvent.type(screen.getByRole("searchbox", { name: "Buscar dado" }), "number");
            await userEvent.keyboard("{Enter}");

            await waitFor(() =>
                expect(inspector.lastChangedConfig().command).toBe("{{item.number}}echo "),
            );
        });

        it("warns that inserted values are quoted and points to the FORJA_* variables", () => {
            renderScriptInspector(requireTestsScript());

            expect(
                screen.getByText(/Valores inseridos com \{\{…\}\} entram entre aspas\./),
            ).toHaveTextContent("$FORJA_ITEM_TITLE");
            expect(
                screen.getByRole("link", { name: "Ver todas as variáveis FORJA_*" }),
            ).toHaveAttribute("href", "/docs/nodes/script");
        });
    });

    describe("presets", () => {
        it("fills an empty command with npm test, the item container and failing on errors", async () => {
            const emptyScript = withConfig({
                command: "",
                runIn: "isolated",
                onFailure: "continue",
            });
            const inspector = renderScriptInspector(emptyScript);

            await userEvent.click(screen.getByRole("button", { name: "Rodar testes" }));

            expect(inspector.lastChangedConfig()).toMatchObject({
                command: "npm test",
                runIn: "item",
                onFailure: "fail",
            });
        });

        it("asks before replacing a command that is already filled", async () => {
            const onChange = renderScriptInspector(withConfig({ command: "make build" })).onChange;

            await userEvent.click(screen.getByRole("button", { name: "Rodar testes" }));

            expect(screen.getByText("Substituir o comando atual?")).toBeInTheDocument();
            expect(onChange).not.toHaveBeenCalled();
        });

        it("replaces the command once the replacement is confirmed", async () => {
            const inspector = renderScriptInspector(withConfig({ command: "make build" }));

            await userEvent.click(screen.getByRole("button", { name: "Rodar lint" }));
            await userEvent.click(screen.getByRole("button", { name: "Substituir" }));

            expect(inspector.lastChangedConfig().command).toBe("npm run lint");
            expect(screen.queryByText("Substituir o comando atual?")).not.toBeInTheDocument();
        });

        it("keeps the command when the replacement is cancelled", async () => {
            const onChange = renderScriptInspector(withConfig({ command: "make build" })).onChange;

            await userEvent.click(screen.getByRole("button", { name: "Rodar lint" }));
            await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

            expect(screen.queryByText("Substituir o comando atual?")).not.toBeInTheDocument();
            expect(onChange).not.toHaveBeenCalled();
        });
    });

    describe("where it runs", () => {
        it("runs in an isolated container when 'Container isolado' is chosen", async () => {
            const inspector = renderScriptInspector(requireTestsScript());

            await userEvent.click(screen.getByRole("radio", { name: /^Container isolado/ }));

            expect(inspector.lastChangedConfig().runIn).toBe("isolated");
        });

        it("forgets the image when going back to the item container", async () => {
            const isolatedScript = withConfig({ runIn: "isolated", image: "node:22" });
            const inspector = renderScriptInspector(isolatedScript);

            await userEvent.click(screen.getByRole("radio", { name: /^Container do item/ }));

            expect(inspector.lastChangedConfig()).toMatchObject({
                runIn: "item",
                image: undefined,
            });
        });

        it("tells that the item container needs the item input", () => {
            renderScriptInspector(withConfig({ runIn: "item" }));

            expect(screen.getByText(ITEM_REQUIRED_NOTICE)).toBeInTheDocument();
        });

        it("shows the image field and drops the item notice in an isolated container", () => {
            renderScriptInspector(withConfig({ runIn: "isolated" }));

            expect(screen.queryByText(ITEM_REQUIRED_NOTICE)).not.toBeInTheDocument();
            expect(
                within(requireAdvancedSection()).getByRole("textbox", { name: "Imagem" }),
            ).toHaveAttribute("placeholder", "imagem do agente do projeto");
        });
    });

    describe("on failure", () => {
        it("continues and lets a Decisão judge when that card is chosen", async () => {
            const inspector = renderScriptInspector(withConfig({ onFailure: "fail" }));

            await userEvent.click(
                screen.getByRole("radio", { name: /^Continuar e deixar uma Decisão julgar/ }),
            );

            expect(inspector.lastChangedConfig().onFailure).toBe("continue");
        });

        it("suggests linking Resultado › passed to a Decisão when the node continues", () => {
            renderScriptInspector(withConfig({ onFailure: "continue" }));

            expect(screen.getByText(DECISION_HINT)).toBeInTheDocument();
        });

        it("hides the Decisão hint when the node fails", () => {
            renderScriptInspector(withConfig({ onFailure: "fail" }));

            expect(screen.queryByText(DECISION_HINT)).not.toBeInTheDocument();
        });
    });

    describe("environment variables", () => {
        it("adds a text variable with the typed name and value", async () => {
            const inspector = renderScriptInspector(withConfig({ env: [] }));

            await userEvent.click(screen.getByRole("button", { name: "Adicionar variável" }));
            await userEvent.type(
                screen.getByRole("textbox", { name: "Nome da variável 1" }),
                "TITLE",
            );
            await userEvent.type(
                screen.getByRole("textbox", { name: "Valor da variável 1" }),
                "Oi",
            );
            await userEvent.tab();

            expect(inspector.lastChangedConfig().env).toEqual([{ name: "TITLE", value: "Oi" }]);
        });

        it("shows the error under an invalid name while it is typed", async () => {
            const onChange = renderScriptInspector(withConfig({ env: [] })).onChange;

            await userEvent.click(screen.getByRole("button", { name: "Adicionar variável" }));
            await userEvent.type(
                screen.getByRole("textbox", { name: "Nome da variável 1" }),
                "FOO-BAR",
            );

            expect(
                screen.getByRole("textbox", { name: "Nome da variável 1" }),
            ).toHaveAccessibleDescription(
                "Use letras maiúsculas, números e _, sem começar por número.",
            );
            expect(onChange).not.toHaveBeenCalled();
        });

        it("lists the project credentials and saves the chosen one", async () => {
            const inspector = renderScriptInspector(
                withConfig({ env: [{ name: "NPM_TOKEN", value: "" }] }),
            );

            await userEvent.click(screen.getByRole("combobox", { name: "Tipo da variável 1" }));
            await userEvent.click(screen.getByRole("option", { name: "Credencial" }));
            await userEvent.click(
                screen.getByRole("combobox", { name: "Credencial da variável 1" }),
            );
            await userEvent.click(await screen.findByRole("option", { name: NPM_CREDENTIAL.name }));

            expect(inspector.lastChangedConfig().env).toEqual([
                { name: "NPM_TOKEN", credentialId: NPM_CREDENTIAL.id },
            ]);
        });

        it("inserts the picked field at the end of a text value", async () => {
            const inspector = renderScriptInspector(
                withConfig({ env: [{ name: "ISSUE", value: "#" }] }),
            );

            await userEvent.click(
                within(screen.getByRole("group", { name: "Variável 1" })).getByRole("button", {
                    name: "Inserir dado",
                }),
            );
            await userEvent.type(screen.getByRole("searchbox", { name: "Buscar dado" }), "number");
            await userEvent.keyboard("{Enter}");

            expect(inspector.lastChangedConfig().env).toEqual([
                { name: "ISSUE", value: "#{{item.number}}" },
            ]);
        });

        it("removes the chosen variable", async () => {
            const inspector = renderScriptInspector(withConfig({ env: TWO_ENV_VARS }));

            await userEvent.click(screen.getByRole("button", { name: "Remover a variável 1" }));

            expect(inspector.lastChangedConfig().env).toEqual([{ name: "SECOND", value: "2" }]);
        });

        it("moves a variable down", async () => {
            const inspector = renderScriptInspector(withConfig({ env: TWO_ENV_VARS }));

            await userEvent.click(screen.getByRole("button", { name: "Descer a variável 1" }));

            expect(inspector.lastChangedConfig().env).toEqual([
                { name: "SECOND", value: "2" },
                { name: "FIRST", value: "1" },
            ]);
        });
    });

    describe("output format", () => {
        it("reads the last line as JSON when that card is chosen", async () => {
            const inspector = renderScriptInspector(requireTestsScript());

            await userEvent.click(screen.getByRole("radio", { name: /^JSON \(última linha\)/ }));

            expect(inspector.lastChangedConfig().parseOutput).toBe("lastLineJson");
        });

        it("shows an example of each format", () => {
            renderScriptInspector(requireTestsScript());

            expect(
                screen.getByRole("radio", { name: /^JSON \(saída inteira\)/ }),
            ).toHaveTextContent('{"coverage": 81}');
        });
    });

    describe("advanced", () => {
        it("keeps the shell, the directory and the timeout folded in Avançado", () => {
            renderScriptInspector(withConfig({ runIn: "item" }));

            const advancedSection = requireAdvancedSection();
            expect(advancedSection).not.toHaveAttribute("open");
            expect(
                within(advancedSection).getByRole("radiogroup", { name: "Shell" }),
            ).toBeInTheDocument();
            expect(
                within(advancedSection).getByRole("textbox", { name: "Diretório" }),
            ).toHaveAttribute("placeholder", "raiz do repositório");
            expect(
                within(advancedSection).queryByRole("textbox", { name: "Imagem" }),
            ).not.toBeInTheDocument();
        });

        it("runs the command with sh when it is chosen", async () => {
            const inspector = renderScriptInspector(requireTestsScript());

            await userEvent.click(screen.getByRole("radio", { name: /^sh/ }));

            expect(inspector.lastChangedConfig().shell).toBe("sh");
        });

        it("applies the typed working directory", async () => {
            const inspector = renderScriptInspector(requireTestsScript());

            await userEvent.type(
                screen.getByRole("textbox", { name: "Diretório" }),
                "packages/api",
            );
            await userEvent.tab();

            expect(inspector.lastChangedConfig().workingDir).toBe("packages/api");
        });

        it("applies the typed image of the isolated container", async () => {
            const inspector = renderScriptInspector(withConfig({ runIn: "isolated" }));

            await userEvent.type(screen.getByRole("textbox", { name: "Imagem" }), "node:22");
            await userEvent.tab();

            expect(inspector.lastChangedConfig().image).toBe("node:22");
        });

        it("applies a new timeout", async () => {
            const inspector = renderScriptInspector(requireTestsScript());
            const timeoutField = screen.getByRole("spinbutton", {
                name: "Tempo máximo (minutos)",
            });

            await userEvent.clear(timeoutField);
            await userEvent.type(timeoutField, "5");
            await userEvent.tab();

            expect(inspector.lastChangedConfig().timeoutMinutes).toBe(5);
        });
    });
});

interface RenderedInspector {
    onChange: NodeChangeSpy;
    lastChangedConfig: () => ScriptConfig;
}

function renderScriptInspector(script: ScriptNode): RenderedInspector {
    stubFetchRoutes({
        [`GET /api/projects/${PROJECT_ID}/runs?limit=5&flowId=${FLOW_ID}`]: () => Response.json([]),
        "GET /api/credentials": () => Response.json([NPM_CREDENTIAL]),
    });
    const onChange: NodeChangeSpy = vi.fn();
    renderWithQueryClient(
        <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/flows/${FLOW_ID}`]}>
            <Routes>
                <Route
                    path="/projects/:projectId/flows/:flowId"
                    element={<ScriptInspector node={script} graph={GRAPH} onChange={onChange} />}
                />
            </Routes>
        </MemoryRouter>,
    );

    return {
        onChange,
        lastChangedConfig: () => readScriptConfig(applyLastUpdate(onChange, script)),
    };
}

function requireAdvancedSection(): HTMLElement {
    const advancedSection = screen.getByText("Avançado").closest("details");
    if (!advancedSection) {
        throw new Error("The inspector has no Avançado section");
    }

    return advancedSection;
}

function applyLastUpdate(onChange: NodeChangeSpy, node: FlowNode): FlowNode {
    const lastCall = onChange.mock.lastCall;
    if (!lastCall) {
        throw new Error("The inspector did not change the node");
    }

    return lastCall[0](node);
}

function readScriptConfig(node: FlowNode): ScriptConfig {
    if (!isNodeOfType(node, "script")) {
        throw new Error(`Node ${node.id} is not a script`);
    }

    return node.config;
}

function withConfig(changes: Partial<ScriptConfig>): ScriptNode {
    const script = requireTestsScript();

    return { ...script, config: { ...script.config, ...changes } };
}

function requireTestsScript(): ScriptNode {
    const node = findNode(GRAPH, TESTS_SCRIPT_ID);
    if (!node || !isNodeOfType(node, "script")) {
        throw new Error(`Script ${TESTS_SCRIPT_ID} not found`);
    }

    return node;
}
