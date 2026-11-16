import type { DocumentedType, NodeCategory, NodeDoc } from "@/web/docs/node_docs/node_doc.js";
import { agentDoc } from "@/web/docs/node_docs/agent_doc.js";
import { conditionDoc } from "@/web/docs/node_docs/condition_doc.js";
import { gateDoc } from "@/web/docs/node_docs/gate_doc.js";
import { gitDoc } from "@/web/docs/node_docs/git_doc.js";
import { loopDoc } from "@/web/docs/node_docs/loop_doc.js";
import { mapDoc } from "@/web/docs/node_docs/map_doc.js";
import { outputDoc } from "@/web/docs/node_docs/output_doc.js";
import { scriptDoc } from "@/web/docs/node_docs/script_doc.js";
import { sourceDoc } from "@/web/docs/node_docs/source_doc.js";
import { triggerDoc } from "@/web/docs/node_docs/trigger_doc.js";

export { NODE_CATEGORIES } from "@/web/docs/node_docs/node_doc.js";

export const NODE_DOCS: Record<DocumentedType, NodeDoc> = {
    trigger: triggerDoc,
    source: sourceDoc,
    agent: agentDoc,
    script: scriptDoc,
    condition: conditionDoc,
    gate: gateDoc,
    git: gitDoc,
    output: outputDoc,
    map: mapDoc,
    loop: loopDoc,
};

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
    inicio: "Início",
    trabalho: "Buscar trabalho",
    ia: "IA",
    executar: "Executar",
    decidir: "Decidir",
    humano: "Humano",
    entrega: "Entrega",
    fim: "Fim",
    grupo: "Grupos",
};

export function getNodeDoc(type: DocumentedType): NodeDoc {
    return NODE_DOCS[type];
}

export function findNodeDoc(type: string): NodeDoc | undefined {
    return Object.values(NODE_DOCS).find((doc) => doc.type === type);
}
