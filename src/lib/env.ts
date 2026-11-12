import { z } from "zod";

const DEFAULT_PORT = 4317;
const LOWEST_PORT = 1;
const HIGHEST_PORT = 65535;
const LOOPBACK_HOST = "127.0.0.1";

export const envSchema = z.object({
    FORJA_DATA_DIR: z.string().optional(),
    FORJA_PORT: z.coerce.number().int().min(LOWEST_PORT).max(HIGHEST_PORT).default(DEFAULT_PORT),
    FORJA_HOST: z.literal(LOOPBACK_HOST).default(LOOPBACK_HOST),
    FORJA_AGENT_RUNTIME: z.enum(["docker", "fake"]).default("docker"),
    FORJA_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    NODE_ENV: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export class InvalidEnvError extends Error {
    constructor(problems: string[]) {
        super(`Variáveis de ambiente inválidas:\n${problems.join("\n")}`);
        this.name = "InvalidEnvError";
    }
}

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
    const result = envSchema.safeParse(source);
    if (!result.success) {
        throw new InvalidEnvError(result.error.issues.map(describeIssue));
    }

    return result.data;
}

function describeIssue(issue: z.core.$ZodIssue): string {
    const variableName = issue.path.join(".");
    return `- ${variableName}: ${issue.message}`;
}
