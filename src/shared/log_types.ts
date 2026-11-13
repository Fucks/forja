import { z } from "zod";

const MAX_LOG_PAGE_SIZE = 2_000;
const DEFAULT_LOG_PAGE_SIZE = 500;
export const FIRST_LOG_SEQ = 1;
export const LOGS_EXPIRED_CODE = "logs_expired";
export const LOGS_EXPIRED_MESSAGE = "Logs removidos pela política de retenção";

export const LOG_EVENT_KINDS = ["text", "tool_call", "raw", "system"] as const;

export const storedLogEventSchema = z.object({
    seq: z.number().int().positive(),
    at: z.string(),
    kind: z.enum(LOG_EVENT_KINDS),
    text: z.string().optional(),
    name: z.string().optional(),
    args: z.string().optional(),
    line: z.string().optional(),
    message: z.string().optional(),
    iteration: z.number().int().optional(),
});

export type StoredLogEvent = z.infer<typeof storedLogEventSchema>;

export interface LogPage {
    events: StoredLogEvent[];
    nextSeq: number;
    total: number;
}

export const logPageQuery = z.object({
    fromSeq: z.coerce.number().int().positive().default(FIRST_LOG_SEQ),
    limit: z.coerce.number().int().positive().max(MAX_LOG_PAGE_SIZE).default(DEFAULT_LOG_PAGE_SIZE),
});
