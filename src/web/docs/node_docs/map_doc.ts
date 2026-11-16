import { MAX_MAP_CONCURRENCY } from "@/shared/flow_graph.js";
import type { NodeDoc } from "@/web/docs/node_docs/node_doc.js";

export const mapDoc: NodeDoc = {
    type: "map",
    title: "Map",
    category: "grupo",
    tagline: "Processa cada item separadamente, vários ao mesmo tempo",
    whatItDoes:
        "Processa cada item separadamente, até N ao mesmo tempo. Dentro do grupo, cada nó vê um " +
        "item só. Ao sair do grupo, os resultados voltam a ser uma lista.",
    whenToUse: [
        "Logo depois de uma Fonte, para trabalhar em cada issue por conta própria.",
        "Para desenvolver várias issues em paralelo.",
    ],
    ports: { inputs: [], outputs: [] },
    fields: [
        {
            key: "concurrency",
            label: "Itens em paralelo",
            description: `Quantos itens o grupo processa ao mesmo tempo, até ${MAX_MAP_CONCURRENCY}.`,
            defaultValue: "1 (um por vez)",
        },
        {
            key: "barrier",
            label: "Esperar todos",
            description:
                "O passo depois do grupo só começa quando todos os itens terminam o grupo.",
            defaultValue: "Desligado",
        },
        {
            key: "failFast",
            label: "Parar na primeira falha",
            description: "Se um item falhar, cancela os outros.",
            defaultValue: "Desligado",
        },
    ],
    examples: [
        {
            title: "Três issues em paralelo",
            description: "Dev dentro de um Map com 3 itens em paralelo.",
            config: { concurrency: 3 },
        },
    ],
    pitfalls: [
        "Aumentar os itens em paralelo além do que o limite de uso do Claude aguenta.",
        "Esperar que um nó dentro do grupo veja os outros itens.",
    ],
    related: ["source", "loop"],
};
