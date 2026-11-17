import { flowNodeSchema, NODE_TYPES, type NodeType, type Port } from "@/shared/flow_graph.js";
import { createDefaultNode } from "@/shared/node_defaults.js";

const ORIGIN = { x: 0, y: 0 };

const EXPECTED_PORTS: Record<NodeType, { inputs: Port[]; outputs: Port[] }> = {
    trigger: {
        inputs: [],
        outputs: [{ name: "items", type: "workItemList", required: false }],
    },
    source: {
        inputs: [{ name: "trigger", type: "any", required: false }],
        outputs: [{ name: "items", type: "workItemList", required: true }],
    },
    agent: {
        inputs: [
            { name: "item", type: "workItem", required: false },
            { name: "context", type: "text", required: false },
        ],
        outputs: [
            { name: "result", type: "json", required: true },
            { name: "summary", type: "text", required: true },
        ],
    },
    script: {
        inputs: [{ name: "item", type: "workItem", required: true }],
        outputs: [
            { name: "result", type: "json", required: true },
            { name: "output", type: "text", required: true },
        ],
    },
    condition: {
        inputs: [{ name: "value", type: "json", required: true }],
        outputs: [
            { name: "true", type: "any", required: true },
            { name: "false", type: "any", required: true },
        ],
    },
    gate: {
        inputs: [{ name: "item", type: "workItem", required: true }],
        outputs: [
            { name: "approved", type: "workItem", required: true },
            { name: "rejected", type: "workItem", required: true },
        ],
    },
    git: {
        inputs: [
            { name: "item", type: "workItem", required: true },
            { name: "body", type: "text", required: false },
        ],
        outputs: [{ name: "result", type: "json", required: true }],
    },
    output: {
        inputs: [{ name: "item", type: "workItem", required: true }],
        outputs: [],
    },
};

describe("createDefaultNode", () => {
    it.each(NODE_TYPES)("creates a %s node with its default ports", (type) => {
        const node = createDefaultNode(type, "n1", ORIGIN);

        expect({ inputs: node.inputs, outputs: node.outputs }).toEqual(EXPECTED_PORTS[type]);
    });

    it.each(NODE_TYPES)("creates a %s node that passes the node schema", (type) => {
        const node = createDefaultNode(type, "n1", ORIGIN);

        expect(flowNodeSchema.parse(node)).toEqual(node);
    });

    it("places the node with the given id and position, outside any group", () => {
        const node = createDefaultNode("script", "tests", { x: 120, y: -40 });

        expect(node).toMatchObject({ id: "tests", type: "script", position: { x: 120, y: -40 } });
        expect(node.parentGroupId).toBeUndefined();
    });

    it("labels each node in Portuguese", () => {
        const labels = NODE_TYPES.map((type) => createDefaultNode(type, "n1", ORIGIN).label);

        expect(labels).toEqual([
            "Gatilho",
            "Fonte",
            "Agente",
            "Script",
            "Condição",
            "Aprovação",
            "Git",
            "Saída",
        ]);
    });

    it("fills the agent config with the documented defaults", () => {
        const node = createDefaultNode("agent", "n1", ORIGIN);

        expect(node.config).toEqual({
            prompt: "",
            maxIterations: 1,
            expandPromptCommands: true,
            workspace: "item",
            timeoutMinutes: 60,
            idleTimeoutMinutes: 10,
            retries: 1,
        });
    });

    it("fills the source config with the documented defaults", () => {
        const node = createDefaultNode("source", "n1", ORIGIN);

        expect(node.config).toEqual({
            provider: "github",
            state: "open",
            limit: 20,
            skipBlocked: true,
        });
    });

    it("fills the configs of the remaining node types", () => {
        const configs = (["trigger", "script", "condition", "gate", "git", "output"] as const).map(
            (type) => createDefaultNode(type, "n1", ORIGIN).config,
        );

        expect(configs).toEqual([
            { kind: "manual" },
            {
                command: "",
                shell: "bash",
                runIn: "item",
                env: [],
                onFailure: "fail",
                parseOutput: "none",
                timeoutMinutes: 15,
            },
            { condition: { op: "eq", path: "inputs.value.approved", value: true } },
            { message: "", show: ["diff", "artifacts", "logs"] },
            { action: "open_pr", draft: false },
            { moveItemTo: "done", commentOnIssue: false },
        ]);
    });

    it("does not share ports or config between created nodes", () => {
        const first = createDefaultNode("agent", "n1", ORIGIN);
        const second = createDefaultNode("agent", "n2", ORIGIN);

        expect(first.inputs).not.toBe(second.inputs);
        expect(first.config).not.toBe(second.config);
    });
});
