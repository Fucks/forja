import { z } from "zod";

import { conditionSchema } from "@/shared/conditions.js";
import { PORT_NAME_PATTERN } from "@/shared/port_name.js";

export const OTHERWISE_PORT = "otherwise";
export const MAX_BRANCHES = 10;
export const BRANCH_LABEL_MAX_LENGTH = 40;

const branchSchema = z.object({
    port: z.string().regex(PORT_NAME_PATTERN),
    label: z.string().min(1).max(BRANCH_LABEL_MAX_LENGTH),
    condition: conditionSchema,
});
export type SwitchBranch = z.infer<typeof branchSchema>;

const ifConditionConfigSchema = z.object({ mode: z.literal("if"), condition: conditionSchema });
export type IfConditionConfig = z.infer<typeof ifConditionConfigSchema>;

const switchConditionConfigSchema = z.object({
    mode: z.literal("switch"),
    branches: z.array(branchSchema).min(1).max(MAX_BRANCHES),
    otherwise: z.boolean().default(true),
});
export type SwitchConditionConfig = z.infer<typeof switchConditionConfigSchema>;

/** Every field a Decisão can have, whatever its mode; the documentation lists them all. */
export const conditionConfigFieldsSchema = ifConditionConfigSchema.extend(
    switchConditionConfigSchema.shape,
);

export const conditionConfigSchema = z.preprocess(
    // Every Decisão saved before the switch mode existed has no `mode`, and they are all yes/no.
    (raw) => (isObject(raw) && !("mode" in raw) ? { ...raw, mode: "if" } : raw),
    z.discriminatedUnion("mode", [ifConditionConfigSchema, switchConditionConfigSchema]),
);
export type ConditionConfig = z.output<typeof conditionConfigSchema>;

function isObject(value: unknown): value is object {
    return typeof value === "object" && value !== null;
}
