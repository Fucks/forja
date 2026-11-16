import { MAX_SOURCE_LIMIT, MIN_SOURCE_LIMIT } from "@/shared/node_configs/source_config.js";
import type { NodeDoc } from "@/web/docs/node_docs/node_doc.js";

export const sourceDoc: NodeDoc = {
    type: "source",
    title: "Fonte",
    category: "trabalho",
    tagline: "Busca as issues do GitHub ou os itens locais a processar",
    whatItDoes:
        "Busca os itens de trabalho que o fluxo vai processar: issues do GitHub ou itens locais " +
        "do board. Ao entrar num grupo Map, a lista vira um item por vez.",
    whenToUse: [
        "Para escolher quais issues o fluxo vai processar.",
        "Para trabalhar com itens criados no board, sem GitHub.",
    ],
    ports: {
        inputs: [
            {
                name: "trigger",
                label: "Sinal de início",
                type: "any",
                required: false,
                description:
                    "Opcional. Só ordena a execução: a Fonte roda depois do nó ligado aqui.",
            },
        ],
        outputs: [
            {
                name: "items",
                label: "Itens",
                type: "workItemList",
                required: true,
                description:
                    "A lista de itens encontrados. Ao entrar num grupo Map, vira um item por vez.",
            },
        ],
    },
    fields: [
        {
            key: "provider",
            label: "De onde buscar",
            description: "A origem dos itens de trabalho.",
            options: [
                {
                    value: "github",
                    label: "GitHub",
                    description: "Issues abertas do repositório do projeto.",
                },
                { value: "local", label: "Local", description: "Itens criados no board." },
            ],
        },
        {
            key: "label",
            label: "Label",
            description: "Só busca issues com essa label, por exemplo Sandcastle.",
            defaultValue: "Vazio (qualquer label)",
        },
        {
            key: "state",
            label: "Situação",
            description: "Só busca itens abertos. Este valor é fixo.",
            defaultValue: "Abertos",
        },
        {
            key: "limit",
            label: "Máximo de itens",
            description: `Quantos itens entram em cada run, de ${MIN_SOURCE_LIMIT} a ${MAX_SOURCE_LIMIT}.`,
            defaultValue: "20",
        },
        {
            key: "skipBlocked",
            label: "Pular bloqueadas",
            description:
                "Pula issues bloqueadas por outras ainda abertas, como uma issue que diz " +
                '"depends on #12" enquanto a #12 não fecha.',
            defaultValue: "Ligado",
        },
    ],
    examples: [
        {
            title: "Pegar até 5 bugs",
            description: "Busca até 5 issues abertas com a label bug.",
            config: { provider: "github", label: "bug", limit: 5 },
        },
    ],
    pitfalls: [
        "Esquecer a label e buscar todas as issues abertas do repositório.",
        'Esperar issues bloqueadas com "Pular bloqueadas" ligado.',
    ],
    related: ["trigger", "map"],
};
