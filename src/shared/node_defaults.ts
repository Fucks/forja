import type {
    FlowNode,
    NodeOfType,
    NodeType,
    Port,
    PortType,
    Position,
} from "@/shared/flow_graph.js";
import { agentConfigSchema } from "@/shared/node_configs/agent_config.js";
import { GATE_REVIEW_SECTIONS } from "@/shared/node_configs/gate_config.js";
import { gitConfigSchema } from "@/shared/node_configs/git_config.js";
import { outputConfigSchema } from "@/shared/node_configs/output_config.js";
import { scriptConfigSchema } from "@/shared/node_configs/script_config.js";
import { sourceConfigSchema } from "@/shared/node_configs/source_config.js";

type NodeTemplate<Type extends NodeType> = Pick<
    NodeOfType<Type>,
    "type" | "label" | "inputs" | "outputs" | "config"
>;

export function createDefaultNode(type: NodeType, id: string, position: Position): FlowNode {
    const template = structuredClone(NODE_TEMPLATES[type]);

    return { ...template, id, position: { ...position } };
}

const NODE_TEMPLATES: { [Type in NodeType]: NodeTemplate<Type> } = {
    trigger: {
        type: "trigger",
        label: "Gatilho",
        inputs: [],
        outputs: [optionalPort("items", "workItemList")],
        config: { kind: "manual" },
    },
    source: {
        type: "source",
        label: "Fonte",
        inputs: [optionalPort("trigger", "any")],
        outputs: [requiredPort("items", "workItemList")],
        config: sourceConfigSchema.parse({ provider: "github" }),
    },
    agent: {
        type: "agent",
        label: "Agente",
        inputs: [optionalPort("item", "workItem"), optionalPort("context", "text")],
        outputs: [requiredPort("result", "json"), requiredPort("summary", "text")],
        config: agentConfigSchema.parse({ prompt: "" }),
    },
    script: {
        type: "script",
        label: "Script",
        inputs: [requiredPort("item", "workItem")],
        outputs: [requiredPort("result", "json")],
        config: scriptConfigSchema.parse({ command: "" }),
    },
    condition: {
        type: "condition",
        label: "Condição",
        inputs: [requiredPort("value", "json")],
        outputs: [requiredPort("true", "any"), requiredPort("false", "any")],
        config: { condition: { op: "eq", path: "inputs.value.approved", value: true } },
    },
    gate: {
        type: "gate",
        label: "Aprovação",
        inputs: [requiredPort("item", "workItem")],
        outputs: [requiredPort("approved", "workItem"), requiredPort("rejected", "workItem")],
        config: { message: "", show: [...GATE_REVIEW_SECTIONS] },
    },
    git: {
        type: "git",
        label: "Git",
        inputs: [requiredPort("item", "workItem"), optionalPort("body", "text")],
        outputs: [requiredPort("result", "json")],
        config: gitConfigSchema.parse({ action: "open_pr" }),
    },
    output: {
        type: "output",
        label: "Saída",
        inputs: [requiredPort("item", "workItem")],
        outputs: [],
        config: outputConfigSchema.parse({ moveItemTo: "done" }),
    },
};

function requiredPort(name: string, type: PortType): Port {
    return { name, type, required: true };
}

function optionalPort(name: string, type: PortType): Port {
    return { name, type, required: false };
}
