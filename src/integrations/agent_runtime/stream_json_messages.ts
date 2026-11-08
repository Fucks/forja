import { z } from "zod";

// Objects are not strict: fields added by newer CLI versions are dropped instead of failing the line.

export const textBlockSchema = z.object({ type: z.literal("text"), text: z.string() });

const toolUseBlockSchema = z.object({
    type: z.literal("tool_use"),
    id: z.string(),
    name: z.string(),
    input: z.unknown(),
});

export const assistantBlockSchema = z.discriminatedUnion("type", [
    textBlockSchema,
    toolUseBlockSchema,
]);

export const toolResultBlockSchema = z.object({
    type: z.literal("tool_result"),
    tool_use_id: z.string(),
    content: z.union([z.string(), z.array(z.unknown())]).optional(),
});

// Content blocks stay unknown here so that one unrecognized block does not reject the whole message.
const assistantMessageSchema = z.object({
    type: z.literal("assistant"),
    message: z.object({ content: z.array(z.unknown()) }),
});

const userMessageSchema = z.object({
    type: z.literal("user"),
    message: z.object({ content: z.union([z.string(), z.array(z.unknown())]) }),
});

const initMessageSchema = z.object({
    type: z.literal("system"),
    subtype: z.literal("init"),
    model: z.string().optional(),
    tools: z.array(z.string()).default([]),
    mcp_servers: z.array(z.object({ name: z.string(), status: z.string() })).default([]),
});

const apiRetryMessageSchema = z.object({
    type: z.literal("system"),
    subtype: z.literal("api_retry"),
    attempt: z.number(),
    max_retries: z.number(),
    error: z.string().optional(),
    error_status: z.number().nullable().optional(),
});

const snakeCaseUsageSchema = z.object({
    input_tokens: z.number().default(0),
    output_tokens: z.number().default(0),
    cache_read_input_tokens: z.number().default(0),
    cache_creation_input_tokens: z.number().default(0),
});

const modelUsageSchema = z.object({
    inputTokens: z.number().default(0),
    outputTokens: z.number().default(0),
    cacheReadInputTokens: z.number().default(0),
    cacheCreationInputTokens: z.number().default(0),
});

const resultMessageSchema = z.object({
    type: z.literal("result"),
    subtype: z.string(),
    is_error: z.boolean().default(false),
    result: z.string().optional(),
    structured_output: z.unknown().optional(),
    usage: snakeCaseUsageSchema.optional(),
    modelUsage: z.record(z.string(), modelUsageSchema).optional(),
    total_cost_usd: z.number().optional(),
    num_turns: z.number().optional(),
    session_id: z.string().optional(),
    duration_ms: z.number().optional(),
    permission_denials: z
        .array(z.object({ tool_name: z.string(), reason: z.string().optional() }))
        .default([]),
    errors: z.array(z.string()).default([]),
});

export const streamJsonMessageSchema = z.union([
    assistantMessageSchema,
    userMessageSchema,
    z.discriminatedUnion("subtype", [initMessageSchema, apiRetryMessageSchema]),
    resultMessageSchema,
]);

/** Matches any message the parser understands, even when the rest of its shape is wrong. */
export const knownMessageHeaderSchema = z.union([
    z.object({ type: z.enum(["assistant", "user", "result"]) }),
    z.object({ type: z.literal("system"), subtype: z.enum(["init", "api_retry"]) }),
]);

export type StreamJsonMessage = z.infer<typeof streamJsonMessageSchema>;
export type InitMessage = z.infer<typeof initMessageSchema>;
export type ApiRetryMessage = z.infer<typeof apiRetryMessageSchema>;
export type ResultMessage = z.infer<typeof resultMessageSchema>;
export type ToolResultBlock = z.infer<typeof toolResultBlockSchema>;
export type AssistantBlock = z.infer<typeof assistantBlockSchema>;

export function blocksMatching<Block>(schema: z.ZodType<Block>, blocks: unknown[]): Block[] {
    return blocks.flatMap((block) => {
        const parsed = schema.safeParse(block);
        return parsed.success ? [parsed.data] : [];
    });
}
