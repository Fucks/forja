import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import type { Mock } from "vitest";

import { findNode } from "@/engine/graph_queries.js";
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

    describe("advanced", () => {
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
