export interface Concept {
    id: string;
    title: string;
    body: string[];
}

export const PORT_TYPES_CONCEPT_ID = "ports";

export const CONCEPTS: Concept[] = [
    {
        id: "work-item",
        title: "Item de trabalho",
        body: [
            "Um item é uma unidade de trabalho: uma issue do GitHub ou um item local do board.",
            "A Fonte busca os itens, e cada item percorre o fluxo por conta própria, como uma " +
                "ficha que anda pelo canvas.",
        ],
    },
    {
        id: "run",
        title: "Run",
        body: [
            "Uma run é uma execução do fluxo, iniciada pelo Gatilho. Ela fica presa à versão " +
                "publicada que estava valendo quando começou.",
            "Cada nó que roda para um item vira um passo da run, com status, logs e custo " +
                "próprios.",
        ],
    },
    {
        id: "clean-context",
        title: "Nó e contexto limpo",
        body: [
            "Cada nó faz uma coisa só: rodar um agente, rodar um comando, decidir um caminho, " +
                "esperar uma aprovação.",
            "Um Agente começa sempre sem memória: ele só sabe o que está no prompt, o que chega " +
                "pelas entradas e os arquivos do workspace do item. Nada passa entre nós fora das " +
                "portas e do workspace.",
        ],
    },
    {
        id: PORT_TYPES_CONCEPT_ID,
        title: "Porta e tipos",
        body: [
            "As portas são as entradas (à esquerda do nó) e as saídas (à direita). Uma ligação " +
                "leva o que sai de um nó para a entrada de outro.",
            "Cada porta tem um tipo, e só portas de tipos compatíveis se ligam. Uma porta do " +
                "tipo qualquer aceita tudo.",
        ],
    },
    {
        id: "data-flow",
        title: "Como os dados andam",
        body: [
            "Dentro de um Map, o item atual chega sozinho em todos os nós do grupo, sem ligação.",
            "Os outros dados chegam pelas entradas: o que um nó anterior entregou numa saída " +
                "ligada a este nó.",
            "No prompt, {{item.title}} e {{item.number}} leem o item atual, e " +
                "{{inputs.<porta>}} lê o que chegou numa entrada, como {{inputs.context}}.",
        ],
    },
    {
        id: "map",
        title: "Map",
        body: [
            "O Map é um grupo que processa cada item separadamente, vários ao mesmo tempo. " +
                "Dentro dele, cada nó vê um item só.",
            "Cada item que termina o grupo segue adiante sem esperar os outros, a não ser que " +
                "Esperar todos esteja ligado.",
        ],
    },
    {
        id: "loop",
        title: "Loop",
        body: [
            "O Loop é um grupo que repete os nós de dentro até a condição de parada valer, como " +
                "devolver o código ao Dev até o Reviewer aprovar.",
            "Todo Loop tem um máximo de voltas. Quando elas acabam sem a condição valer, o item " +
                "sai por Esgotou as voltas.",
        ],
    },
    {
        id: "item-workspace",
        title: "Workspace do item",
        body: [
            "Cada item ganha um workspace: uma cópia do repositório numa branch só dele, dentro " +
                "de um container.",
            "Os nós do mesmo item usam o mesmo workspace ao longo da run: o Dev escreve o código " +
                "e o Reviewer lê a mesma branch. Dois itens nunca dividem uma branch.",
        ],
    },
    {
        id: "guided-example",
        title: "Exemplo guiado: Revisão com volta",
        body: [
            "Para ver Decisão, Comando e Loop juntos, crie um fluxo a partir do template " +
                "Revisão com volta, em Novo fluxo ou no canvas vazio de um fluxo em branco.",
            "Dentro do Loop, o Dev implementa e o Reviewer responde se aprova. A condição de " +
                "parada é a decisão: aprovado, o item sai do Loop; reprovado, volta para o Dev " +
                "com as notas do Reviewer.",
            "Aprovado, o Comando roda npm test e falha o item se algum teste quebrar; só então o " +
                "Git abre o PR com as notas do Reviewer. Se as voltas acabarem sem aprovação, " +
                "o item vai para Precisa de humano.",
        ],
    },
];
