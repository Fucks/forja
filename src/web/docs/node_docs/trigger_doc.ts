import type { NodeDoc } from "@/web/docs/node_docs/node_doc.js";

export const triggerDoc: NodeDoc = {
    type: "trigger",
    title: "Gatilho",
    category: "inicio",
    tagline: "Ponto de partida: define quando o fluxo roda",
    whatItDoes:
        "É o ponto de partida do fluxo. Define quando o fluxo roda e entrega a lista de itens com " +
        "que o run começou.",
    whenToUse: ["Todo fluxo tem exatamente um gatilho."],
    whenNotToUse: ["Para buscar issues ou itens do board: quem busca é o nó Fonte."],
    ports: {
        inputs: [],
        outputs: [
            {
                name: "items",
                label: "Itens",
                type: "workItemList",
                required: false,
                description:
                    "Os itens do run. Vem preenchida quando o run nasce de um card arrastado no " +
                    "board; num disparo manual sem itens, chega vazia.",
            },
        ],
    },
    fields: [
        {
            key: "kind",
            label: "Tipo de disparo",
            description:
                "Quando o fluxo começa. A configuração detalhada fica na tela Gatilhos, e o " +
                "inspector traz o link para ela.",
            defaultValue: "Manual",
            options: [
                {
                    value: "manual",
                    label: "Manual",
                    description: 'Roda quando alguém clica em "Executar".',
                },
                {
                    value: "schedule",
                    label: "Agendado",
                    description: "Roda em horários definidos por uma expressão cron.",
                },
                {
                    value: "event",
                    label: "Por evento",
                    description: 'Roda quando algo acontece, como "limite de uso resetou".',
                },
                {
                    value: "webhook",
                    label: "Webhook",
                    description: "Roda quando uma URL local recebe uma chamada.",
                },
                {
                    value: "board_column",
                    label: "Coluna do board",
                    description: "Roda ao soltar um card numa coluna do board.",
                },
            ],
        },
    ],
    examples: [
        {
            title: "Rodar toda noite",
            description: "Gatilho agendado que processa as issues abertas às 2h da manhã.",
            config: { kind: "schedule" },
        },
    ],
    pitfalls: ["Achar que o gatilho busca issues. Quem busca é o nó Fonte."],
    related: ["source"],
};
