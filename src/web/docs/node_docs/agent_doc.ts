import {
    MAX_AGENT_ITERATIONS,
    MAX_AGENT_RETRIES,
    MAX_AGENT_TURNS,
} from "@/shared/node_configs/agent_config.js";
import type { NodeDoc } from "@/web/docs/node_docs/node_doc.js";

export const agentDoc: NodeDoc = {
    type: "agent",
    title: "Agente",
    category: "ia",
    tagline: "Roda um prompt num Claude Code novo, sem memória dos outros nós",
    whatItDoes:
        "Roda um prompt num Claude Code novo, sem memória dos outros nós. O agente só sabe o que " +
        "está no prompt e o que chega pelas entradas. A resposta sai como texto e, se houver " +
        "Formato da resposta, como dados que uma Decisão consegue ler.",
    whenToUse: [
        "Para escrever ou revisar código, planejar uma tarefa ou resumir uma issue.",
        "Para gerar uma resposta estruturada que uma Decisão vai avaliar.",
    ],
    whenNotToUse: ["Para rodar testes ou outro comando fixo: use um Comando, que é mais rápido."],
    ports: {
        inputs: [
            {
                name: "item",
                label: "Item atual",
                type: "workItem",
                required: false,
                description: "O item em que o agente trabalha. Dentro de um Map, chega sozinho.",
            },
            {
                name: "context",
                label: "Contexto extra",
                type: "text",
                required: false,
                description: "Texto de outro nó, como o resumo do agente anterior.",
            },
        ],
        outputs: [
            {
                name: "result",
                label: "Resultado",
                type: "json",
                required: true,
                description: "Os dados que seguem o Formato da resposta. É o que as Decisões leem.",
            },
            {
                name: "summary",
                label: "Resumo em texto",
                type: "text",
                required: true,
                description: "A última mensagem do agente.",
            },
        ],
    },
    fields: [
        {
            key: "prompt",
            label: "Prompt",
            description:
                "O que o agente deve fazer. Aceita variáveis como {{item.title}}, trocadas pelos " +
                "dados do item.",
        },
        {
            key: "model",
            label: "Modelo",
            description: "O modelo do Claude que roda o prompt.",
            defaultValue: "Vazio (usa o do projeto)",
        },
        {
            key: "effort",
            label: "Esforço",
            description: "Quanto o modelo pensa. Mais esforço custa mais e é mais lento.",
            defaultValue: "Vazio (usa o do projeto)",
            options: [
                { value: "low", label: "Baixo", description: "Rápido e barato." },
                {
                    value: "medium",
                    label: "Médio",
                    description: "Equilíbrio entre custo e cuidado.",
                },
                { value: "high", label: "Alto", description: "Pensa mais antes de agir." },
                { value: "xhigh", label: "Muito alto", description: "Para tarefas difíceis." },
                { value: "max", label: "Máximo", description: "O mais cuidadoso e o mais caro." },
            ],
        },
        {
            key: "workspace",
            label: "Workspace",
            description: "Se o agente trabalha com o código do item ou só com texto.",
            defaultValue: "Workspace do item",
            options: [
                {
                    value: "item",
                    label: "Workspace do item",
                    description: "Uma cópia do código do item, para editar arquivos.",
                },
                {
                    value: "none",
                    label: "Sem workspace",
                    description: "Só pensa ou escreve texto. É mais rápido.",
                },
            ],
        },
        {
            key: "maxIterations",
            label: "Repetições do prompt",
            description:
                "Quantas vezes o mesmo prompt é repetido até o agente avisar que terminou, no " +
                `estilo "Ralph". Até ${MAX_AGENT_ITERATIONS}.`,
            defaultValue: "1 (roda uma vez)",
        },
        {
            key: "completionSignal",
            label: "Sinal de conclusão",
            description:
                "O texto que o agente escreve para dizer que terminou, como " +
                "<promise>COMPLETE</promise>. Encerra as repetições.",
            defaultValue: "Vazio",
        },
        {
            key: "outputSchema",
            label: "Formato da resposta",
            description:
                "Os campos que o agente devolve no Resultado, cada um com nome e tipo (sim/não, " +
                "número, texto, lista ou uma das opções). As Decisões seguintes leem esses " +
                "campos; sem eles, a resposta é só texto e não há o que comparar.",
            defaultValue: "Vazio (resposta livre)",
        },
        {
            key: "maxTurns",
            label: "Máximo de ações",
            description: `Limite de ações do agente em cada execução, até ${MAX_AGENT_TURNS}.`,
            defaultValue: "Sem limite",
            advanced: true,
        },
        {
            key: "maxBudgetUsd",
            label: "Teto de custo (US$)",
            description: "O agente para quando o custo passa desse valor.",
            defaultValue: "Sem teto",
            advanced: true,
        },
        {
            key: "retries",
            label: "Novas tentativas",
            description:
                "Quantas vezes o nó roda de novo se falhar, até " +
                `${MAX_AGENT_RETRIES}. Não repete quando a resposta é ruim.`,
            defaultValue: "1",
            advanced: true,
        },
        {
            key: "timeoutMinutes",
            label: "Tempo máximo (minutos)",
            description: "Depois desse tempo o agente é interrompido.",
            defaultValue: "60 minutos",
            advanced: true,
        },
        {
            key: "idleTimeoutMinutes",
            label: "Tempo máximo parado (minutos)",
            description: "O agente é interrompido se ficar esse tempo sem fazer nada.",
            defaultValue: "10 minutos",
            advanced: true,
        },
        {
            key: "toolProfileId",
            label: "Ferramentas",
            description:
                "O que o agente pode usar: só leitura, CodeGraph, servidores MCP e outros.",
            defaultValue: "Vazio (usa o do projeto)",
            advanced: true,
        },
        {
            key: "credentialId",
            label: "Credencial",
            description: "A conta do Claude usada por este agente.",
            defaultValue: "Vazio (usa a do projeto)",
            advanced: true,
        },
        {
            key: "expandPromptCommands",
            label: "Expandir comandos do prompt",
            description:
                "Troca cada !`comando` do prompt pelo que o comando imprime, antes de enviar ao " +
                "agente.",
            defaultValue: "Ligado",
            advanced: true,
        },
    ],
    examples: [
        {
            title: "Reviewer que devolve aprovado + notas",
            description:
                "Revisa as mudanças do item e devolve approved (sim/não, obrigatório) e notes " +
                "(texto). Use o preset Aprovação; a Decisão seguinte olha approved.",
            config: {
                prompt: "Revise as mudanças de {{item.title}}.",
                workspace: "item",
                outputSchema: {
                    type: "object",
                    properties: { approved: { type: "boolean" }, notes: { type: "string" } },
                    required: ["approved"],
                },
            },
        },
    ],
    pitfalls: [
        "Confundir repetições do prompt com novas tentativas.",
        "Esperar que o agente lembre do nó anterior sem ligar Resumo em texto → Contexto extra.",
    ],
    related: ["condition", "script", "loop"],
};
