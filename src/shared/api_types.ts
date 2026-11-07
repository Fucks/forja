import { z } from "zod";

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
