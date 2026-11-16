import { MAX_LOOP_ITERATIONS, MIN_LOOP_ITERATIONS } from "@/shared/flow_graph.js";
import type { NodeDoc } from "@/web/docs/node_docs/node_doc.js";

export const loopDoc: NodeDoc = {
    type: "loop",
    title: "Loop",
    category: "grupo",
    tagline: "Repete os nós de dentro até a condição de parada valer",
    whatItDoes:
        "Repete os nós de dentro até a condição de parada ser verdadeira ou acabarem as voltas. " +
        "Quando as voltas acabam sem a condição valer, o item sai por Esgotou as voltas.",
    whenToUse: ["Para devolver o trabalho ao Dev até o Reviewer aprovar."],
    whenNotToUse: ["Para processar vários itens: use um Map."],
    ports: {
        inputs: [],
        outputs: [
            {
                name: "exhausted",
                label: "Esgotou as voltas",
                type: "loopExhausted",
                required: false,
                description:
                    "Por onde o item sai quando o limite de voltas é atingido sem a condição " +
                    'ficar verdadeira. Normalmente vai para uma Saída "Precisa de humano".',
            },
        ],
    },
    fields: [
        {
            key: "until",
            label: "Parar quando",
            description:
                "A condição de parada, montada como a regra da Decisão. É avaliada no fim de " +
                "cada volta.",
        },
        {
            key: "maxIterations",
            label: "Máximo de voltas",
            description: `Quantas voltas o grupo dá, de ${MIN_LOOP_ITERATIONS} a ${MAX_LOOP_ITERATIONS}.`,
            defaultValue: "3",
        },
        {
            key: "carry",
            label: "Levar para a próxima volta",
            description:
                "As saídas que passam de uma volta para a próxima, como as notas do Reviewer " +
                "para o Dev.",
            defaultValue: "Nada",
        },
    ],
    examples: [
        {
            title: "Revisar até aprovar",
            description:
                "Dev e Reviewer dentro de um Loop que para quando o Reviewer aprova e leva as " +
                "notas para a próxima volta.",
            config: { maxIterations: 3, carry: ["notes"] },
        },
    ],
    pitfalls: [
        "Deixar Esgotou as voltas sem ligação e o item parar sem destino.",
        "Esquecer de levar as notas e o Dev repetir o mesmo erro.",
    ],
    related: ["agent", "condition", "map"],
};
