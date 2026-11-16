import type { NodeType, PortType } from "@/shared/flow_graph.js";

export type GroupKind = "map" | "loop";
export type DocumentedType = NodeType | GroupKind;

export const NODE_CATEGORIES = [
    "inicio",
    "trabalho",
    "ia",
    "executar",
    "decidir",
    "humano",
    "entrega",
    "fim",
    "grupo",
] as const;
export type NodeCategory = (typeof NODE_CATEGORIES)[number];

export interface PortDoc {
    name: string;
    label: string;
    type: PortType | "loopExhausted";
    required: boolean;
    description: string;
}

export interface FieldOptionDoc {
    value: string;
    label: string;
    description: string;
}

export interface FieldDoc {
    key: string;
    label: string;
    description: string;
    defaultValue?: string;
    options?: FieldOptionDoc[];
    advanced?: boolean;
}

export interface NodeExample {
    title: string;
    description: string;
    config?: Record<string, unknown>;
}

export interface NodeDoc {
    type: DocumentedType;
    title: string;
    category: NodeCategory;
    tagline: string;
    whatItDoes: string;
    whenToUse: string[];
    whenNotToUse?: string[];
    ports: { inputs: PortDoc[]; outputs: PortDoc[] };
    fields: FieldDoc[];
    examples: NodeExample[];
    pitfalls: string[];
    related: DocumentedType[];
}
