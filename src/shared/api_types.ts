import { z } from "zod";

import { sourceConfigSchema } from "@/shared/node_configs/source_config.js";

export interface ApiErrorBody {
    error: { code: string; message: string; details?: unknown };
}

export const apiErrorBodySchema: z.ZodType<ApiErrorBody> = z.object({
    error: z.object({
        code: z.string(),
        message: z.string(),
        details: z.unknown().optional(),
    }),
});

export const sourcePreviewInput = z.object({ config: sourceConfigSchema });

export const sourcePreviewItemSchema = z.object({
    number: z.number().optional(),
    title: z.string(),
    labels: z.array(z.string()),
    blockedBy: z.array(z.number()).optional(),
});
export type SourcePreviewItem = z.infer<typeof sourcePreviewItemSchema>;

/** What a Fonte would take now; `skipped` counts the items left out because they are blocked. */
export const sourcePreviewSchema = z.object({
    items: z.array(sourcePreviewItemSchema),
    skipped: z.number(),
});
export type SourcePreview = z.infer<typeof sourcePreviewSchema>;
