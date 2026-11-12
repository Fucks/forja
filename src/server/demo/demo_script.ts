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
