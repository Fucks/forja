import type { NodeDoc } from "@/web/docs/node_docs/node_doc.js";

export const conditionDoc: NodeDoc = {
    type: "condition",
    title: "Decisão",
    category: "decidir",
    tagline: "Se a regra for verdadeira, segue por Sim; senão, por Não",
    whatItDoes:
        "Avalia uma regra sobre os dados que chegam na entrada. Se a regra for verdadeira, o " +
        "item segue por Sim; senão, por Não. O que chegou na entrada passa adiante pelo caminho " +
        "escolhido.",
    whenToUse: [
        "Para seguir caminhos diferentes conforme o Reviewer aprovar ou reprovar.",
        "Para checar se os testes passaram antes de abrir o PR.",
    ],
    whenNotToUse: ["Para esperar a decisão de uma pessoa: use uma Aprovação humana."],
    ports: {
        inputs: [
            {
                name: "value",
                label: "O que passa adiante",
                type: "json",
                required: true,
                description:
                    "Os dados avaliados pela regra, normalmente o Resultado de um Agente ou de um " +
                    "Comando. Seguem pelo caminho escolhido.",
            },
        ],
        outputs: [
            {
                name: "true",
                label: "Sim",
                type: "any",
                required: true,
                description: "Por onde o item segue quando a regra é verdadeira.",
            },
            {
                name: "false",
                label: "Não",
                type: "any",
                required: true,
                description: "Por onde o item segue quando a regra é falsa.",
            },
        ],
    },
    fields: [
        {
            key: "condition",
            label: "Regra",
            description:
                'A comparação feita sobre os dados da entrada, como "approved é igual a ' +
                'verdadeiro". Dá para juntar várias regras com "e" ou "ou".',
            defaultValue: "approved é igual a verdadeiro",
        },
    ],
    examples: [
        {
            title: "Reviewer aprovou?",
            description:
                "Liga o Resultado do Reviewer na entrada e testa se approved é verdadeiro.",
            config: { condition: { op: "eq", path: "approved", value: true } },
        },
        {
            title: "Testes passaram?",
            description: "Liga o Resultado de um Comando e testa se exitCode é igual a 0.",
            config: { condition: { op: "eq", path: "exitCode", value: 0 } },
        },
    ],
    pitfalls: [
        "Ler um campo que o agente não devolve: defina o Formato da resposta no Agente.",
        "Deixar a porta Não sem ligação e o item parar sem destino.",
    ],
    related: ["agent", "script", "loop"],
};
