import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { Mock } from "vitest";

import type { Condition } from "@/shared/conditions.js";
import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";
import { branchPortsOf } from "@/shared/node_configs/condition_branches.js";
import { MAX_BRANCHES } from "@/shared/node_configs/condition_config.js";
import type {
    ConditionConfig,
    SwitchConditionConfig,
} from "@/shared/node_configs/condition_config.js";
import {
    buildCanonicalFlow,
    connect,
    createNodeOfType,
} from "@/test/factories/flow_graph_factory.js";
import { addEdges, addNodes } from "@/test/factories/flow_graph_variations.js";
import { renderWithQueryClient } from "@/test/render_with_query_client.js";
import { ConditionBranchesEditor } from "@/web/canvas/inspector/condition_branches_editor.js";
import { ConditionInspector } from "@/web/canvas/inspector/condition_inspector.js";
import { updateNodeConfig } from "@/web/canvas/inspector/node_updates.js";

type ConfigChangeSpy = Mock<(config: SwitchConditionConfig) => void>;
type NodeUpdate = (node: FlowNode) => FlowNode;
type NodeChangeSpy = Mock<(update: NodeUpdate) => void>;

const DECISION_ID = "review";

const APPROVED: Condition = { op: "eq", path: "inputs.value.approved", value: true };
const HAS_NOTES: Condition = { op: "isNotEmpty", path: "inputs.value.notes" };
const REVIEW_SWITCH: SwitchConditionConfig = {
    mode: "switch",
    branches: [
        { port: "approved", label: "Aprovado", condition: APPROVED },
        { port: "changes", label: "Ajustes", condition: HAS_NOTES },
    ],
    otherwise: true,
};

describe("ConditionBranchesEditor", () => {
    it("shows one card per branch, in order, and Senão at the end", () => {
        renderBranchesEditor(REVIEW_SWITCH);

        const cardNames = screen.getAllByRole("region").map((card) => card.ariaLabel);
        expect(cardNames).toEqual(["Caminho 1", "Caminho 2", "Senão"]);
    });

    it("adds a branch without rules at the end, on a port of its own", async () => {
        const onChange = renderBranchesEditor(REVIEW_SWITCH);

        await userEvent.click(screen.getByRole("button", { name: "Adicionar caminho" }));

        expect(lastConfig(onChange).branches.at(-1)).toEqual({
            port: "branch1",
            label: "Caminho 3",
            condition: { op: "and", conditions: [] },
        });
    });

    it("does not add a branch past the tenth", () => {
        const branches = Array.from({ length: MAX_BRANCHES }, (_, index) => ({
            port: `branch${index + 1}`,
            label: `Caminho ${index + 1}`,
            condition: APPROVED,
        }));

        renderBranchesEditor({ ...REVIEW_SWITCH, branches });

        expect(screen.getByRole("button", { name: "Adicionar caminho" })).toBeDisabled();
    });

    it("moves a branch up", async () => {
        const onChange = renderBranchesEditor(REVIEW_SWITCH);

        await userEvent.click(branchButton(2, "Subir caminho"));

        expect(portsOf(lastConfig(onChange))).toEqual(["changes", "approved"]);
    });

    it("moves a branch down", async () => {
        const onChange = renderBranchesEditor(REVIEW_SWITCH);

        await userEvent.click(branchButton(1, "Descer caminho"));

        expect(portsOf(lastConfig(onChange))).toEqual(["changes", "approved"]);
    });

    it("cannot move the first branch up nor the last one down", () => {
        renderBranchesEditor(REVIEW_SWITCH);

        expect(branchButton(1, "Subir caminho")).toBeDisabled();
        expect(branchButton(2, "Descer caminho")).toBeDisabled();
    });

    it("removes a branch", async () => {
        const onChange = renderBranchesEditor(REVIEW_SWITCH);

        await userEvent.click(branchButton(1, "Remover caminho"));

        expect(portsOf(lastConfig(onChange))).toEqual(["changes"]);
    });

    it("keeps the only branch", () => {
        renderBranchesEditor({ ...REVIEW_SWITCH, branches: REVIEW_SWITCH.branches.slice(0, 1) });

        expect(branchButton(1, "Remover caminho")).toBeDisabled();
    });

    it("renames a branch and keeps its port", async () => {
        const onChange = renderBranchesEditor(REVIEW_SWITCH);
        const nameInput = within(branchCard(1)).getByRole("textbox", { name: "Nome do caminho" });

        await userEvent.clear(nameInput);
        await userEvent.type(nameInput, "Aprovado de primeira");
        await userEvent.tab();

        expect(lastConfig(onChange).branches[0]).toMatchObject({
            port: "approved",
            label: "Aprovado de primeira",
        });
    });

    it("keeps the name of a branch when it is erased", async () => {
        const onChange = renderBranchesEditor(REVIEW_SWITCH);
        const nameInput = within(branchCard(1)).getByRole("textbox", { name: "Nome do caminho" });

        await userEvent.clear(nameInput);
        await userEvent.tab();

        expect(onChange).not.toHaveBeenCalled();
    });

    it("edits the rules of a branch", async () => {
        const onChange = renderBranchesEditor(REVIEW_SWITCH);

        await userEvent.click(
            within(branchCard(2)).getByRole("combobox", { name: "Operador da regra 1" }),
        );
        await userEvent.click(screen.getByRole("option", { name: "está vazio" }));

        expect(lastConfig(onChange).branches[1]?.condition).toEqual({
            op: "isEmpty",
            path: "inputs.value.notes",
        });
    });

    it("turns Senão off", async () => {
        const onChange = renderBranchesEditor(REVIEW_SWITCH);

        await userEvent.click(screen.getByRole("switch", { name: "Usar Senão" }));

        expect(lastConfig(onChange).otherwise).toBe(false);
    });
});

describe("ConditionInspector mode", () => {
    it("turns a yes/no decision into paths with its rule as Sim and a Senão", async () => {
        const onChange = renderDecisionInspector({ mode: "if", condition: APPROVED });

        await userEvent.click(screen.getByRole("radio", { name: "Vários caminhos" }));

        const decision = applyLastUpdate(
            onChange,
            buildDecision({ mode: "if", condition: APPROVED }),
        );
        expect(decision.config).toEqual({
            mode: "switch",
            branches: [{ port: "branch1", label: "Sim", condition: APPROVED }],
            otherwise: true,
        });
        expect(decision.outputs.map((port) => port.name)).toEqual(["branch1", "otherwise"]);
    });

    it("asks before going back to yes/no and dropping the other paths", async () => {
        const onChange = renderDecisionInspector(REVIEW_SWITCH);

        await userEvent.click(screen.getByRole("radio", { name: "Sim/Não" }));

        expect(screen.getByRole("alert")).toHaveTextContent(
            "Sim/Não fica só com o primeiro caminho. Remover os outros 1?",
        );
        expect(onChange).not.toHaveBeenCalled();
    });

    it("goes back to yes/no with the rule of the first path once confirmed", async () => {
        const onChange = renderDecisionInspector(REVIEW_SWITCH);

        await userEvent.click(screen.getByRole("radio", { name: "Sim/Não" }));
        await userEvent.click(screen.getByRole("button", { name: "Remover e trocar" }));

        const decision = applyLastUpdate(onChange, buildDecision(REVIEW_SWITCH));
        expect(decision.config).toEqual({ mode: "if", condition: APPROVED });
        expect(decision.outputs.map((port) => port.name)).toEqual(["true", "false"]);
    });

    it("keeps the paths when going back to yes/no is cancelled", async () => {
        const onChange = renderDecisionInspector(REVIEW_SWITCH);

        await userEvent.click(screen.getByRole("radio", { name: "Sim/Não" }));
        await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
    });

    it("goes back to yes/no right away when there is a single path", async () => {
        const singlePath = { ...REVIEW_SWITCH, branches: REVIEW_SWITCH.branches.slice(0, 1) };
        const onChange = renderDecisionInspector(singlePath);

        await userEvent.click(screen.getByRole("radio", { name: "Sim/Não" }));

        const decision = applyLastUpdate(onChange, buildDecision(singlePath));
        expect(decision.config).toEqual({ mode: "if", condition: APPROVED });
    });

    it("removes a path and its edges in a single change", async () => {
        const graph = buildGraphWithEdgesOutOf(buildDecision(REVIEW_SWITCH));
        const onChange = renderDecisionInspector(REVIEW_SWITCH, graph);

        await userEvent.click(branchButton(1, "Remover caminho"));

        expect(onChange).toHaveBeenCalledOnce();
        const update = onChange.mock.lastCall?.[0] ?? ((node: FlowNode) => node);
        const updatedGraph = updateNodeConfig(graph, DECISION_ID, update);
        const portsWithEdges = updatedGraph.edges
            .filter((edge) => edge.from.nodeId === DECISION_ID)
            .map((edge) => edge.from.port);
        expect(portsWithEdges).toEqual(["changes"]);
    });
});

function buildDecision(config: ConditionConfig): FlowNode {
    const decision = createNodeOfType("condition", DECISION_ID, { x: 0, y: 0 });

    return { ...decision, outputs: branchPortsOf(config), config };
}

function buildGraphWithEdgesOutOf(decision: FlowNode): FlowGraph {
    const graph = addNodes(buildCanonicalFlow(), [decision]);

    return addEdges(graph, [
        connect([DECISION_ID, "approved"], ["done", "item"]),
        connect([DECISION_ID, "changes"], ["needs_human", "item"]),
    ]);
}

function renderDecisionInspector(
    config: ConditionConfig,
    graph: FlowGraph = buildCanonicalFlow(),
): NodeChangeSpy {
    const onChange: NodeChangeSpy = vi.fn();
    renderWithQueryClient(
        <MemoryRouter>
            <ConditionInspector node={buildDecision(config)} graph={graph} onChange={onChange} />
        </MemoryRouter>,
    );

    return onChange;
}

function applyLastUpdate(onChange: NodeChangeSpy, node: FlowNode): FlowNode {
    const update = onChange.mock.lastCall?.[0];
    if (!update) {
        throw new Error("O inspector não mudou o nó.");
    }

    return update(node);
}

function renderBranchesEditor(config: SwitchConditionConfig): ConfigChangeSpy {
    const onChange: ConfigChangeSpy = vi.fn();
    render(<ConditionBranchesEditor config={config} fields={[]} onChange={onChange} />);

    return onChange;
}

function branchCard(branchNumber: number): HTMLElement {
    return screen.getByRole("region", { name: `Caminho ${branchNumber}` });
}

function branchButton(branchNumber: number, name: string): HTMLElement {
    return within(branchCard(branchNumber)).getByRole("button", { name });
}

function lastConfig(onChange: ConfigChangeSpy): SwitchConditionConfig {
    const [config] = onChange.mock.lastCall ?? [];
    if (!config) {
        throw new Error("O editor não mudou a configuração.");
    }

    return config;
}

function portsOf(config: SwitchConditionConfig): string[] {
    return config.branches.map((branch) => branch.port);
}
