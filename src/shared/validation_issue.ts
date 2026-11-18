import { z } from "zod";

export interface ValidationIssue {
    level: "error" | "warning";
    code: string;
    message: string;
    fix?: string;
    fieldKey?: string;
    target: { kind: "node" | "edge" | "group" | "flow"; id?: string };
}

export const validationIssueSchema: z.ZodType<ValidationIssue> = z.object({
    level: z.enum(["error", "warning"]),
    code: z.string(),
    message: z.string(),
    fix: z.string().optional(),
    fieldKey: z.string().optional(),
    target: z.object({
        kind: z.enum(["node", "edge", "group", "flow"]),
        id: z.string().optional(),
    }),
});
