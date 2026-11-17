import type { NodeDoc } from "@/web/docs/node_docs/node_doc.js";

export const conditionDoc: NodeDoc = {
    type: "condition",
    title: "Decisão",
    category: "decidir",
    tagline: "Se a regra for verdadeira, segue por Sim; senão, por Não",
    whatItDoes:
        "Avalia uma regra sobre os dados disponíveis: a entrada, as saídas dos nós anteriores, o " +
        "item atual, o projeto e a execução. A regra aparece como uma frase, como “Se Reviewer › " +
        "approved é verdadeiro”. Se for verdadeira, o item segue por Sim; senão, por Não. O que " +
        "chegou na entrada passa adiante pelo caminho escolhido.",
    whenToUse: [
        "Para seguir caminhos diferentes conforme o Reviewer aprovar ou reprovar.",
        "Para checar se os testes passaram antes de abrir o PR.",
        "Para dar um tratamento diferente aos itens com uma label, como urgente.",
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
                "Escolha o dado e o editor mostra só os operadores que servem para o tipo dele: " +
                "sim/não, número, texto, texto com opções fechadas, lista ou objeto. O valor é " +
                "pedido com o controle certo, e dá para juntar várias regras com “e” ou “ou”. " +
                "“Testar com o último run” mostra o caminho que a regra tomaria com os dados reais.",
            defaultValue: "inputs.value.approved é verdadeiro",
            options: [
                {
                    value: "eq",
                    label: "é verdadeiro / é falso / é igual a / =",
                    description:
                        "O dado é exatamente o valor; para sim/não, é verdadeiro ou falso.",
                },
                {
                    value: "neq",
                    label: "é diferente de / ≠",
                    description: "O dado não é o valor.",
                },
                {
                    value: "gt, gte, lt, lte",
                    label: "> / ≥ / < / ≤",
                    description: "Compara números.",
                },
                {
                    value: "contains, notContains",
                    label: "contém / não contém",
                    description: "Procura um trecho num texto ou um elemento numa lista.",
                },
                {
                    value: "startsWith",
                    label: "começa com",
                    description: "O texto começa com o trecho.",
                },
                {
                    value: "in",
                    label: "é um de",
                    description:
                        "O dado é uma das opções escolhidas; serve para campos com opções.",
                },
                {
                    value: "isEmpty, isNotEmpty",
                    label: "está vazio / não está vazio",
                    description:
                        "Texto, lista ou objeto vazio; um dado que não existe conta como vazio.",
                },
                {
                    value: "minLength",
                    label: "tem pelo menos N",
                    description: "A lista (ou o texto) tem pelo menos N elementos (ou caracteres).",
                },
                {
                    value: "exists",
                    label: "existe / não existe",
                    description: "O dado está presente, mesmo que seja nulo.",
                },
            ],
        },
    ],
    examples: [
        {
            title: "Reviewer aprovou?",
            description:
                "Liga o Resultado do Reviewer na entrada e testa se approved é verdadeiro.",
            config: {
                condition: { op: "eq", path: "nodes.reviewer.result.approved", value: true },
            },
        },
        {
            title: "Testes passaram?",
            description:
                "Escolhe Testes › Resultado › passed, de um Comando, e testa se é verdadeiro.",
            config: { condition: { op: "eq", path: "nodes.testes.result.passed", value: true } },
        },
        {
            title: "Tem a label urgente?",
            description: "Escolhe Item atual › labels e testa se contém urgente.",
            config: { condition: { op: "contains", path: "item.labels", value: "urgente" } },
        },
    ],
    pitfalls: [
        "Ler um campo que o agente não devolve: defina o Formato da resposta no Agente.",
        "Usar um operador que não serve para o tipo do dado, como “contém” num sim/não: o fluxo " +
            "mostra o erro e sugere os operadores certos.",
        "Deixar a porta Não sem ligação e o item parar sem destino.",
    ],
    related: ["agent", "script", "loop"],
};
