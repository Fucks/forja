import { z } from "zod";

export const CREDENTIAL_KINDS = [
    "anthropic_api_key",
    "claude_oauth_token",
    "github_token",
    "generic_env",
] as const;

export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

export type FixedEnvVarCredentialKind = Exclude<CredentialKind, "generic_env">;

export const ENV_VAR_BY_KIND: Record<FixedEnvVarCredentialKind, string> = {
    anthropic_api_key: "ANTHROPIC_API_KEY",
    claude_oauth_token: "CLAUDE_CODE_OAUTH_TOKEN",
    github_token: "GH_TOKEN",
};

export const CREDENTIAL_NAME_MAX_LENGTH = 60;
export const ENV_VAR_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

const credentialName = z.string().trim().min(1).max(CREDENTIAL_NAME_MAX_LENGTH);
const credentialValue = z.string().min(1);

export const credentialInput = z
    .object({
        name: credentialName,
        kind: z.enum(CREDENTIAL_KINDS),
        value: credentialValue,
        envVar: z.string().regex(ENV_VAR_PATTERN).optional(),
    })
    .superRefine((input, context) => {
        if (input.kind === "generic_env" && input.envVar === undefined) {
            context.addIssue({
                code: "custom",
                path: ["envVar"],
                message: "Informe a variável de ambiente da credencial genérica.",
            });
        }
    });

export type CredentialInput = z.infer<typeof credentialInput>;

const renameCredentialInput = z.object({ name: credentialName, value: credentialValue.optional() });
// Strict so an invalid name next to a value is rejected instead of silently dropped.
const replaceCredentialValueInput = z.strictObject({ value: credentialValue });

export const updateCredentialInput = z.union([renameCredentialInput, replaceCredentialValueInput]);

export type UpdateCredentialInput = z.infer<typeof updateCredentialInput>;

export interface CredentialSummary {
    id: string;
    name: string;
    kind: CredentialKind;
    masked: string;
    envVar: string;
    lastCheckedAt?: string;
    lastCheckOk?: boolean;
    createdAt: string;
    updatedAt: string;
}
