import { z } from "zod";

export const jsonSchemaSchema = z.record(z.string(), z.unknown());
export type JsonSchema = z.infer<typeof jsonSchemaSchema>;
