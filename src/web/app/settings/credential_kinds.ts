import { CREDENTIAL_KINDS } from "@/shared/credential_types.js";
import type { CredentialKind } from "@/shared/credential_types.js";

export const CREDENTIAL_KIND_LABELS: Record<CredentialKind, string> = {
    anthropic_api_key: "API key da Anthropic",
    claude_oauth_token: "Token do Claude (assinatura)",
    github_token: "Token do GitHub",
    generic_env: "Variável de ambiente",
};

export const CREDENTIAL_KIND_HELP: Record<CredentialKind, string> = {
    anthropic_api_key: "Crie no console da Anthropic; o uso é cobrado por token na API.",
    claude_oauth_token: "Gere com `claude setup-token`; vale um ano; usa sua assinatura.",
    github_token: "Token pessoal do GitHub com acesso aos repositórios dos projetos.",
    generic_env: "Qualquer segredo, entregue ao agente na variável de ambiente escolhida.",
};

export const CREDENTIAL_KIND_OPTIONS = CREDENTIAL_KINDS.map((kind) => ({
    value: kind,
    label: CREDENTIAL_KIND_LABELS[kind],
}));
