import { z } from "zod";

import { conditionSchema } from "@/shared/conditions.js";

export const conditionConfigSchema = z.object({ condition: conditionSchema });
export type ConditionConfig = z.infer<typeof conditionConfigSchema>;
