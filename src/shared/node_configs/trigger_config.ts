import { z } from "zod";

import { TRIGGER_KINDS } from "@/shared/trigger_types.js";

export const triggerConfigSchema = z.object({ kind: z.enum(TRIGGER_KINDS) });
export type TriggerConfig = z.infer<typeof triggerConfigSchema>;
