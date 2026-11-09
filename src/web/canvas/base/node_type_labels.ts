import type { NodeType } from "@/shared/flow_graph.js";

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
    trigger: "Gatilho",
    source: "Fonte",
    agent: "Agente",
    script: "Script",
    condition: "Condição",
    gate: "Aprovação",
    git: "Git",
    output: "Saída",
};
