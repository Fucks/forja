/** Value of `data-tour-anchor` on the editor areas the tour points to. */
export const TOUR_ANCHORS = {
    palette: "palette",
    inspector: "inspector",
    publish: "publish",
} as const;

export interface TourStep {
    title: string;
    text: string;
    anchorSelector: string;
}

// React Flow draws every node and port with these classes, so the tour finds them on any flow.
const FIRST_NODE_SELECTOR = ".react-flow__node";
const FIRST_PORT_SELECTOR = ".react-flow__handle";

export const TOUR_STEPS: TourStep[] = [
    {
        title: "Paleta",
        text: "Aqui ficam os passos do fluxo: agentes, comandos, decisões, grupos. Arraste um para o canvas.",
        anchorSelector: anchorSelectorOf(TOUR_ANCHORS.palette),
    },
    {
        title: "Nós",
        text: "Cada caixa no canvas é um passo. Clique numa para ver e mudar o que ela faz.",
        anchorSelector: FIRST_NODE_SELECTOR,
    },
    {
        title: "Portas",
        text: "As bolinhas nas bordas são portas. Arraste de uma saída até uma entrada para passar dados.",
        anchorSelector: FIRST_PORT_SELECTOR,
    },
    {
        title: "Inspector",
        text: "Configure o passo selecionado aqui; as abas Dados e Ajuda mostram o que ele recebe e como funciona.",
        anchorSelector: anchorSelectorOf(TOUR_ANCHORS.inspector),
    },
    {
        title: "Publicar",
        text: "Quando não houver erros em Problemas, publique: as execuções usam a versão publicada.",
        anchorSelector: anchorSelectorOf(TOUR_ANCHORS.publish),
    },
];

function anchorSelectorOf(anchor: string): string {
    return `[data-tour-anchor="${anchor}"]`;
}
