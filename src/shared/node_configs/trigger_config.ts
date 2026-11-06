import { z } from "zod";

export const TRIGGER_KINDS = ["manual", "schedule", "event", "webhook", "board_column"] as const;

export const triggerConfigSchema = z.object({ kind: z.enum(TRIGGER_KINDS) });
export type TriggerConfig = z.infer<typeof triggerConfigSchema>;
