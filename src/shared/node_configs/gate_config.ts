import { z } from "zod";

export const GATE_REVIEW_SECTIONS = ["diff", "artifacts", "logs"] as const;

export const gateConfigSchema = z.object({
    message: z.string(),
    show: z.array(z.enum(GATE_REVIEW_SECTIONS)),
    timeoutHours: z.number().positive().optional(),
});
export type GateConfig = z.infer<typeof gateConfigSchema>;
