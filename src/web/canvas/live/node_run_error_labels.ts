import type { NodeRunErrorKind } from "@/engine/node_run_state.js";

export const NODE_RUN_ERROR_LABELS: Record<NodeRunErrorKind, string> = {
    usage_limit: "Limite de uso",
    timeout_total: "Tempo esgotado (total)",
    timeout_idle: "Tempo esgotado (inatividade)",
    structured_output: "Saída estruturada inválida",
    runtime: "Erro de execução",
    script_failed: "Comando falhou",
    workspace: "Erro no workspace",
    budget: "Orçamento esgotado",
    canceled: "Cancelado",
    interrupted: "Interrompido",
};
