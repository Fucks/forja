import type { StoredLogEvent } from "@/shared/log_types.js";

export const LOG_STARTED_AT = new Date("2026-01-01T12:00:00.000Z");
const MS_BETWEEN_EVENTS = 1_000;

export function buildStoredLogEvent(
    overrides: Partial<StoredLogEvent> & Pick<StoredLogEvent, "seq">,
): StoredLogEvent {
    const at = new Date(LOG_STARTED_AT.getTime() + (overrides.seq - 1) * MS_BETWEEN_EVENTS);

    return {
        at: at.toISOString(),
        kind: "text",
        text: `Evento ${overrides.seq}`,
        ...overrides,
    };
}

export function buildStoredLogEvents(fromSeq: number, toSeq: number): StoredLogEvent[] {
    return Array.from({ length: toSeq - fromSeq + 1 }, (_, index) =>
        buildStoredLogEvent({ seq: fromSeq + index }),
    );
}
