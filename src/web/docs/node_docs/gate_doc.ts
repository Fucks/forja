import type { NodeDoc } from "@/web/docs/node_docs/node_doc.js";

export const gateDoc: NodeDoc = {
    type: "gate",
    title: "Aprovação humana",
    category: "humano",
    tagline: "Pausa o item até alguém aprovar ou rejeitar",
    whatItDoes:
        "Pausa o item até alguém aprovar ou rejeitar na tela Aprovações. O item segue só pelo " +
        "caminho escolhido.",
    whenToUse: [
        "Antes de abrir um PR, para uma pessoa conferir o diff.",
        "Quando uma decisão não pode ser automática.",
    ],
    whenNotToUse: ["Para regras que o fluxo pode checar sozinho: use uma Decisão."],
    ports: {
        inputs: [
            {
                name: "item",
                label: "Item atual",
                type: "workItem",
                required: true,
                description: "O item que espera a aprovação.",
            },
        ],
        outputs: [
            {
                name: "approved",
                label: "Aprovado",
                type: "workItem",
                required: true,
                description: "Por onde o item segue quando a pessoa aprova.",
            },
            {
                name: "rejected",
                label: "Rejeitado",
                type: "workItem",
                required: true,
                description: "Por onde o item segue quando a pessoa rejeita.",
            },
        ],
    },
    fields: [
        {
            key: "message",
            label: "Mensagem",
            description: "O que a pessoa deve verificar antes de decidir.",
        },
        {
            key: "show",
            label: "O que mostrar",
            description: "O que aparece na tela Aprovações para ajudar a decidir.",
            defaultValue: "Diff, artefatos e logs",
            options: [
                { value: "diff", label: "Diff", description: "As mudanças no código do item." },
                {
                    value: "artifacts",
                    label: "Artefatos",
                    description: "Os arquivos gerados pelos nós anteriores.",
                },
                { value: "logs", label: "Logs", description: "O registro do que os nós fizeram." },
            ],
        },
        {
            key: "timeoutHours",
            label: "Prazo (horas)",
            description:
                'Quanto tempo a aprovação espera. Ao vencer, o item vai para "Precisa de humano".',
            defaultValue: "Sem prazo",
        },
    ],
    examples: [
        {
            title: "Conferir antes do PR",
            description: "Mostra o diff e pede para conferir se a mudança atende a issue.",
            config: { message: "A mudança atende a issue?", show: ["diff"] },
        },
    ],
    pitfalls: ["Deixar a porta Rejeitado sem ligação e o item parar sem destino."],
    related: ["condition", "git"],
};
