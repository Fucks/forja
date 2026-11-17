import { MIN_SCRIPT_TIMEOUT_MINUTES } from "@/shared/node_configs/script_config.js";
import type { NodeDoc } from "@/web/docs/node_docs/node_doc.js";

export const scriptDoc: NodeDoc = {
    type: "script",
    title: "Comando",
    category: "executar",
    tagline: "Roda um comando de terminal num container",
    whatItDoes:
        "Roda um comando de terminal num container, no container do item ou num container " +
        "isolado, e diz se deu certo. Nunca roda na sua máquina. O comando recebe as variáveis " +
        "FORJA_RUN_ID, FORJA_PROJECT_BASE_BRANCH e FORJA_ITERATION; com item, também " +
        "FORJA_ITEM_ID, FORJA_ITEM_NUMBER, FORJA_ITEM_TITLE, FORJA_ITEM_BRANCH e FORJA_ITEM_URL; " +
        "e FORJA_INPUT_<ENTRADA> com o JSON de cada entrada. Os valores de {{...}} entram no " +
        "comando entre aspas, como um único argumento, sem risco de injeção.",
    whenToUse: [
        "Para rodar os testes, o lint ou o build depois que um agente mexeu no código.",
        "Para preparar o workspace, como instalar dependências.",
        "Para medir algo do repositório (cobertura, tamanho) e decidir com o resultado.",
    ],
    whenNotToUse: ["Para tarefas que pedem raciocínio: use um Agente."],
    ports: {
        inputs: [
            {
                name: "item",
                label: "Item atual",
                type: "workItem",
                required: true,
                description:
                    'O item em cujo container o comando roda. Só é obrigatória com "Onde roda" ' +
                    "no container do item.",
            },
        ],
        outputs: [
            {
                name: "result",
                label: "Resultado",
                type: "json",
                required: true,
                description:
                    "O código de saída (exitCode), se passou (passed), o fim do stdout e do " +
                    "stderr, a duração (durationMs) e, se pedido, o JSON lido da saída (data). " +
                    "Ligue numa Decisão para seguir caminhos diferentes.",
            },
            {
                name: "output",
                label: "Saída",
                type: "text",
                required: true,
                description:
                    "O texto impresso pelo comando (últimas 200 linhas), para o contexto de um " +
                    "Agente.",
            },
        ],
    },
    fields: [
        {
            key: "command",
            label: "Comando",
            description:
                "O comando de terminal a rodar, como npm test. Aceita {{...}} com os dados do " +
                "fluxo, como {{item.number}}.",
        },
        {
            key: "runIn",
            label: "Onde roda",
            description: "Em qual container o comando roda.",
            defaultValue: "Container do item",
            options: [
                {
                    value: "item",
                    label: "Container do item",
                    description:
                        "Na cópia do código deste item, onde os agentes trabalham. Use para " +
                        "testes, lint e build.",
                },
                {
                    value: "isolated",
                    label: "Container isolado",
                    description:
                        "Num container novo, sem o código do item. Use para tarefas que não " +
                        "dependem da branch.",
                },
            ],
        },
        {
            key: "onFailure",
            label: "Se o comando falhar",
            description: "O que acontece quando o código de saída não é 0.",
            defaultValue: "Marcar o nó como falho",
            options: [
                {
                    value: "fail",
                    label: "Marcar o nó como falho (recomendado)",
                    description:
                        "O nó fica vermelho e tenta de novo, conforme as retentativas do projeto.",
                },
                {
                    value: "continue",
                    label: "Continuar e deixar uma Decisão julgar",
                    description:
                        "O nó termina bem com passed falso, para uma Decisão ou um Loop julgar.",
                },
            ],
        },
        {
            key: "parseOutput",
            label: "Formato da saída",
            description:
                "Como ler o stdout. Com JSON, os dados vão para result.data; se não for JSON " +
                "válido, data fica vazio e o nó não falha.",
            defaultValue: "Texto",
            options: [
                {
                    value: "none",
                    label: "Texto",
                    description: "A saída fica só como texto. Ex.: 12 testes passaram",
                },
                {
                    value: "json",
                    label: "JSON (saída inteira)",
                    description: 'O stdout inteiro é um JSON. Ex.: {"coverage": 81}',
                },
                {
                    value: "lastLineJson",
                    label: "JSON (última linha)",
                    description:
                        "A última linha não vazia do stdout é um JSON; as anteriores podem ser " +
                        'logs. Ex.: logs e, por fim, {"coverage": 81}',
                },
            ],
        },
        {
            key: "env",
            label: "Variáveis de ambiente",
            description:
                "Nome e valor de cada variável. O valor aceita {{...}} ou vem de uma credencial " +
                "do cofre, que nunca aparece nos logs. Sobrescrevem as FORJA_*, menos " +
                "FORJA_RUN_ID.",
            defaultValue: "Nenhuma",
        },
        {
            key: "workingDir",
            label: "Diretório",
            description: "Onde o comando roda, relativo à raiz do repositório.",
            defaultValue: "A raiz do repositório",
            advanced: true,
        },
        {
            key: "shell",
            label: "Shell",
            description: "O shell que interpreta o comando.",
            defaultValue: "bash",
            advanced: true,
            options: [
                { value: "bash", label: "bash", description: "Aceita a sintaxe do bash." },
                {
                    value: "sh",
                    label: "sh",
                    description: "Para imagens sem bash, como as baseadas em Alpine.",
                },
            ],
        },
        {
            key: "image",
            label: "Imagem",
            description:
                "A imagem Docker do container isolado. Vazio usa a imagem do agente do projeto.",
            defaultValue: "A imagem do agente do projeto",
            advanced: true,
        },
        {
            key: "timeoutMinutes",
            label: "Tempo máximo (minutos)",
            description: `Depois desse tempo o comando é interrompido e o nó falha. Mínimo de ${MIN_SCRIPT_TIMEOUT_MINUTES}.`,
            defaultValue: "15 minutos",
            advanced: true,
        },
    ],
    examples: [
        {
            title: "Rodar os testes",
            description: "Roda a suíte de testes depois do Dev; o nó falha se algum teste quebrar.",
            config: { command: "npm test", onFailure: "fail" },
        },
        {
            title: "Testes que um Loop julga",
            description:
                "Continua mesmo com testes quebrados, para o Loop repetir o Dev até passarem.",
            config: { command: "npm test", onFailure: "continue" },
        },
        {
            title: "Medir a cobertura",
            description:
                'A última linha imprime {"coverage": 81}; uma Decisão lê ' +
                "result.data.coverage.",
            config: {
                command: "npm run coverage --silent | tail -n 1",
                parseOutput: "lastLineJson",
            },
        },
        {
            title: "Publicar com um token do cofre",
            description: "Roda num container isolado, com o token vindo de uma credencial.",
            config: {
                command: "npm publish",
                runIn: "isolated",
                env: [{ name: "NPM_TOKEN", credentialId: "<credencial>" }],
            },
        },
    ],
    pitfalls: [
        'Usar "Marcar o nó como falho" num teste que um Loop deve julgar: o nó para o fluxo ' +
            'em vez de seguir com passed falso. Use "Continuar e deixar uma Decisão julgar".',
        "Pôr aspas em volta de {{...}}: o valor já entra entre aspas.",
    ],
    related: ["agent", "condition"],
};
