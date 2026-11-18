import type { FlowNode, Port } from "@/shared/flow_graph.js";
import { branchPortsOf } from "@/shared/node_configs/condition_branches.js";
import type { SwitchConditionConfig } from "@/shared/node_configs/condition_config.js";
import { createNodeOfType } from "@/test/factories/flow_graph_factory.js";
import { describeNodePort, describePort } from "@/web/canvas/base/port_label.js";

const AGENT_RESULT_PORT: Port = { name: "result", type: "json", required: true };
const USER_PORT: Port = { name: "spec", type: "text", required: true };

describe("describePort", () => {
    it("names a default port and explains it from the node catalog", () => {
        const description = describePort("agent", AGENT_RESULT_PORT);

        expect(description).toEqual({
            label: "Resultado",
            description: "Os dados que seguem o Formato da resposta. É o que as Decisões leem.",
        });
    });

    it("shows the description the user wrote for a port they created", () => {
        const port: Port = { ...USER_PORT, description: "A especificação escrita pelo TL." };

        const description = describePort("agent", port);

        expect(description).toEqual({
            label: "spec",
            description: "A especificação escrita pelo TL.",
        });
    });

    it("names a user port without description by its own name", () => {
        const description = describePort("agent", USER_PORT);

        expect(description).toEqual({ label: "spec" });
    });
});

describe("describeNodePort", () => {
    const triage: SwitchConditionConfig = {
        mode: "switch",
        branches: [
            { port: "bug", label: "Bug", condition: { op: "exists", path: "inputs.value.bug" } },
        ],
        otherwise: true,
    };

    it("names the port of a switch branch by the branch label", () => {
        const [bugPort] = branchPortsOf(triage);

        const description = bugPort && describeNodePort(buildDecision(triage), bugPort);

        expect(description).toEqual({ label: "Bug" });
    });

    it("names the otherwise port Senão", () => {
        const otherwisePort = branchPortsOf(triage).at(-1);

        const description = otherwisePort && describeNodePort(buildDecision(triage), otherwisePort);

        expect(description?.label).toBe("Senão");
    });

    it("describes the ports of other nodes from the node catalog", () => {
        const agent = createNodeOfType("agent", "dev", { x: 0, y: 0 });

        expect(describeNodePort(agent, AGENT_RESULT_PORT).label).toBe("Resultado");
    });

    function buildDecision(config: SwitchConditionConfig): FlowNode {
        const decision = createNodeOfType("condition", "triage", { x: 0, y: 0 });

        return { ...decision, outputs: branchPortsOf(config), config };
    }
});
