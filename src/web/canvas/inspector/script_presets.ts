import type { ScriptConfig } from "@/shared/node_configs/script_config.js";

export interface ScriptPreset {
    id: "tests" | "typecheck" | "lint" | "install" | "make" | "custom";
    label: string;
    description: string;
    config: Partial<ScriptConfig>;
}

export const SCRIPT_PRESETS: ScriptPreset[] = [
    {
        id: "tests",
        label: "Rodar testes",
        description: "Roda a suíte de testes; falha se algum teste quebrar.",
        config: { command: "npm test", runIn: "item", onFailure: "fail" },
    },
    {
        id: "typecheck",
        label: "Checar tipos",
        description: "Roda a checagem de tipos; falha se houver erro de tipo.",
        config: { command: "npm run typecheck", runIn: "item", onFailure: "fail" },
    },
    {
        id: "lint",
        label: "Rodar lint",
        description: "Roda o lint; falha se alguma regra for violada.",
        config: { command: "npm run lint", runIn: "item", onFailure: "fail" },
    },
    {
        id: "install",
        label: "Instalar dependências",
        description: "Instala as dependências do projeto; falha se a instalação der erro.",
        config: { command: "npm ci", onFailure: "fail" },
    },
    {
        id: "make",
        label: "Rodar make",
        description: "Roda um alvo do Makefile; troque <alvo> pelo nome do alvo.",
        config: { command: "make <alvo>" },
    },
    {
        id: "custom",
        label: "Personalizado",
        description: "Escreva o seu próprio comando.",
        config: {},
    },
];
