import type { NodeType } from "@/shared/flow_graph.js";
import { getNodeDoc } from "@/web/docs/node_docs/node_docs.js";

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
    trigger: getNodeDoc("trigger").title,
    source: getNodeDoc("source").title,
    agent: getNodeDoc("agent").title,
    script: getNodeDoc("script").title,
    condition: getNodeDoc("condition").title,
    gate: getNodeDoc("gate").title,
    git: getNodeDoc("git").title,
    output: getNodeDoc("output").title,
};
