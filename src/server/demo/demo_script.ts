export interface DemoToolCall {
    name: string;
    args: Record<string, unknown>;
}

/** What the simulated agents of the demo say and do; each run picks its lines from here. */
export interface DemoScript {
    openings: string[];
    searches: DemoToolCall[];
    reads: DemoToolCall[];
    findings: string[];
    edits: DemoToolCall[];
    verifications: DemoToolCall[];
    summaries: string[];
}

const RUN_THE_TESTS: DemoToolCall = { name: "Bash", args: { command: "npm run test" } };

export const DEMO_SCRIPT: DemoScript = {
    openings: [
        "Vou ler a issue e o código relacionado antes de mudar qualquer coisa.",
        "Começando pela estrutura do projeto para entender onde a mudança se encaixa.",
        "Primeiro, vou procurar como o cardápio é montado hoje.",
    ],
    searches: [
        { name: "Grep", args: { pattern: "priceCents", path: "src" } },
        { name: "Grep", args: { pattern: "OrderStatus", path: "src/orders" } },
        { name: "Grep", args: { pattern: "calculateDeliveryFee", path: "src" } },
    ],
    reads: [
        { name: "Read", args: { file_path: "src/menu/menu_service.ts" } },
        { name: "Read", args: { file_path: "src/orders/place_order.ts" } },
        { name: "Read", args: { file_path: "src/checkout/delivery_fee.ts" } },
    ],
    findings: [
        "Encontrei o ponto certo: o cálculo fica em um só serviço.",
        "Os testes existentes cobrem o caminho feliz; vou acrescentar o caso que falta.",
        "A regra está duplicada em dois lugares; vou centralizar antes de mudar.",
    ],
    edits: [
        { name: "Edit", args: { file_path: "src/menu/menu_service.ts" } },
        { name: "Edit", args: { file_path: "src/orders/place_order.ts" } },
        { name: "Edit", args: { file_path: "src/checkout/delivery_fee.ts" } },
    ],
    verifications: [RUN_THE_TESTS],
    summaries: [
        "Pronto: a mudança está feita e os testes passam.",
        "Concluí a tarefa; todos os testes passam e o código ficou mais simples.",
        "Feito. Acrescentei os testes do novo comportamento e a suíte está verde.",
    ],
};

/** The local items of the demo project, each one a small task of a coffee shop app. */
export const DEMO_ITEMS: { title: string; body: string }[] = [
    {
        title: "Cardápio com preços em centavos",
        body: "Guardar os preços do cardápio como inteiros em centavos e formatar só na tela.",
    },
    {
        title: "Taxa de entrega por faixa de distância",
        body: "Calcular a taxa de entrega a partir das faixas de distância da loja.",
    },
    {
        title: "Pausar a loja nos feriados",
        body: "Recusar pedidos novos enquanto a loja estiver pausada.",
    },
    {
        title: "Pix expira junto com o pedido",
        body: "O QR code do Pix expira em 15 minutos e libera a reserva de estoque.",
    },
    {
        title: "Histórico de pedidos do cliente",
        body: "Listar os pedidos anteriores do cliente, do mais recente ao mais antigo.",
    },
];
