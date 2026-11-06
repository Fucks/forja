import { z } from "zod";

export const ITEM_DESTINATIONS = ["done", "needs_human"] as const;

export const outputConfigSchema = z.object({
    moveItemTo: z.enum(ITEM_DESTINATIONS).optional(),
    commentOnIssue: z.boolean().default(false),
});
export type OutputConfig = z.infer<typeof outputConfigSchema>;
