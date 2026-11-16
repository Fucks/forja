import type { NodeDoc } from "@/web/docs/node_docs/node_doc.js";

export const gitDoc: NodeDoc = {
    type: "git",
    title: "Git",
    category: "entrega",
    tagline: "Atualiza a branch do item, envia ou abre o PR",
    whatItDoes:
        "Executa uma ação de git na branch do item: atualiza com a base, envia a branch ou abre o " +
        "PR. O resultado traz o link do PR e o nome da branch.",
    whenToUse: ["Para abrir o PR depois que o código foi revisado e testado."],
    ports: {
        inputs: [
            {
                name: "item",
                label: "Item atual",
                type: "workItem",
                required: true,
                description: "O item cuja branch recebe a ação.",
            },
            {
                name: "body",
                label: "Texto do PR",
                type: "text",
                required: false,
                description: "Opcional. O texto usado na descrição do PR.",
            },
        ],
        outputs: [
            {
                name: "result",
                label: "Resultado",
                type: "json",
                required: true,
                description: "O link do PR, a branch e os detalhes da ação.",
            },
        ],
    },
    fields: [
        {
            key: "action",
            label: "Ação",
            description: "O que fazer com a branch do item.",
            options: [
                {
                    value: "rebase",
                    label: "Rebase",
                    description:
                        "Atualiza a branch com a base. Se houver conflito, um agente resolve.",
                },
                { value: "push", label: "Push", description: "Envia a branch para o GitHub." },
                { value: "open_pr", label: "Abrir PR", description: "Faz push e abre o PR." },
            ],
        },
        {
            key: "baseBranch",
            label: "Branch base",
            description: "A branch de onde o item parte e para onde o PR aponta.",
            defaultValue: "Vazio (usa a do projeto)",
        },
        {
            key: "draft",
            label: "Rascunho",
            description: "Abre o PR como rascunho.",
            defaultValue: "Desligado",
        },
        {
            key: "bodyFrom",
            label: "Texto do PR vem de",
            description: "De qual entrada vem o texto do PR.",
            defaultValue: "Vazio (texto padrão)",
            advanced: true,
        },
    ],
    examples: [
        {
            title: "Abrir PR em rascunho",
            description: "Abre o PR como rascunho, com o resumo do Dev como descrição.",
            config: { action: "open_pr", draft: true },
        },
    ],
    pitfalls: ["Abrir o PR antes de rodar os testes."],
    related: ["gate", "output"],
};
