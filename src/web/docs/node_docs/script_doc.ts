import { MIN_SCRIPT_TIMEOUT_MINUTES } from "@/shared/node_configs/script_config.js";
import type { NodeDoc } from "@/web/docs/node_docs/node_doc.js";

export const scriptDoc: NodeDoc = {
    type: "script",
    title: "Comando",
    category: "executar",
    tagline: "Roda um comando de terminal no workspace do item",
    whatItDoes:
        "Roda um comando de terminal num container, no workspace do item, e diz se deu certo. " +
        "Nunca roda na sua máquina. O resultado traz o código de saída e o texto impresso.",
    whenToUse: [
        "Para rodar os testes, o lint ou o build depois que um agente mexeu no código.",
        "Para preparar o workspace, como instalar dependências.",
    ],
    whenNotToUse: ["Para tarefas que pedem raciocínio: use um Agente."],
    ports: {
        inputs: [
            {
                name: "item",
                label: "Item atual",
                type: "workItem",
                required: true,
                description: "O item em cujo workspace o comando roda.",
            },
        ],
        outputs: [
            {
                name: "result",
                label: "Resultado",
                type: "json",
                required: true,
                description:
                    "O resultado do comando, com o código de saída e o texto impresso. Ligue numa " +
                    "Decisão para seguir caminhos diferentes quando ele falha.",
            },
        ],
    },
    fields: [
        {
            key: "command",
            label: "Comando",
            description: "O comando de terminal a rodar, como npm test.",
        },
        {
            key: "timeoutMinutes",
            label: "Tempo máximo (minutos)",
            description: `Depois desse tempo o comando é interrompido. Mínimo de ${MIN_SCRIPT_TIMEOUT_MINUTES}.`,
            defaultValue: "15 minutos",
            advanced: true,
        },
        {
            key: "workspace",
            label: "Onde roda",
            description: "O comando roda no container do item, com o código do item. É fixo.",
            defaultValue: "Workspace do item",
            advanced: true,
        },
    ],
    examples: [
        {
            title: "Rodar os testes",
            description: "Roda a suíte de testes depois do Dev; uma Decisão olha o resultado.",
            config: { command: "npm test" },
        },
    ],
    pitfalls: [
        "Esperar que o nó falhe quando o comando falha: o resultado segue adiante e uma Decisão " +
            "precisa julgá-lo.",
    ],
    related: ["agent", "condition"],
};
