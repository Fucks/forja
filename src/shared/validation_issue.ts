import { z } from "zod";

export interface ValidationIssue {
    level: "error" | "warning";
    code: string;
    message: string;
    target: { kind: "node" | "edge" | "group" | "flow"; id?: string };
}

export const validationIssueSchema: z.ZodType<ValidationIssue> = z.object({
    level: z.enum(["error", "warning"]),
    code: z.string(),
    message: z.string(),
    target: z.object({
        kind: z.enum(["node", "edge", "group", "flow"]),
        id: z.string().optional(),
    }),
});
