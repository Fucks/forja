import type { NodeDoc } from "@/web/docs/node_docs/node_doc.js";

export const outputDoc: NodeDoc = {
    type: "output",
    title: "Saída",
    category: "fim",
    tagline: "Encerra o caminho do item e diz onde ele fica no board",
    whatItDoes:
        "Encerra o caminho do item e diz onde ele fica no board. Pode também comentar na issue " +
        "com o resultado.",
    whenToUse: ['No fim de cada caminho do fluxo, como "Concluído" ou "Precisa de humano".'],
    ports: {
        inputs: [
            {
                name: "item",
                label: "Item atual",
                type: "workItem",
                required: true,
                description: "O item que termina aqui.",
            },
        ],
        outputs: [],
    },
    fields: [
        {
            key: "moveItemTo",
            label: "Mover o item para",
            description: "A coluna do board onde o item fica no fim.",
            defaultValue: "Vazio (não move)",
            options: [
                { value: "done", label: "Concluído", description: "O trabalho terminou." },
                {
                    value: "needs_human",
                    label: "Precisa de humano",
                    description: "Alguém precisa olhar o item.",
                },
            ],
        },
        {
            key: "commentOnIssue",
            label: "Comentar na issue",
            description:
                "Comenta na issue com o resultado, o link do PR e o motivo. Se uma entrada " +
                "trouxer notes, reason ou failureSummary, esse texto vira o motivo.",
            defaultValue: "Desligado",
        },
    ],
    examples: [
        {
            title: "Precisa de humano",
            description: "Move o item e comenta na issue o motivo de o Reviewer reprovar.",
            config: { moveItemTo: "needs_human", commentOnIssue: true },
        },
    ],
    pitfalls: ['Esperar um comentário na issue com "Comentar na issue" desligado.'],
    related: ["git", "gate"],
};
