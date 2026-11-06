import { z } from "zod";

export const GIT_ACTIONS = ["rebase", "push", "open_pr"] as const;

export const gitConfigSchema = z.object({
    action: z.enum(GIT_ACTIONS),
    baseBranch: z.string().optional(),
    draft: z.boolean().default(false),
    bodyFrom: z.string().optional(),
});
export type GitConfig = z.infer<typeof gitConfigSchema>;
