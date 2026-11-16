import type { PortType } from "@/shared/flow_graph.js";

export const PORT_TYPE_LABELS: Record<PortType, string> = {
    workItemList: "lista de itens",
    workItem: "item",
    text: "texto",
    json: "JSON",
    branch: "branch",
    prUrl: "URL de PR",
    any: "qualquer",
};
