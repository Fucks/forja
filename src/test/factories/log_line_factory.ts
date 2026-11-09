import type { LogLine } from "@/web/logs/log_types.js";

const MS_BETWEEN_LINES = 250;

export function buildLogLine(overrides: Partial<LogLine> & Pick<LogLine, "seq">): LogLine {
    return {
        offsetMs: overrides.seq * MS_BETWEEN_LINES,
        kind: "text",
        text: `Linha ${overrides.seq}`,
        ...overrides,
    };
}

export function buildLogLines(count: number): LogLine[] {
    return Array.from({ length: count }, (_, index) => buildLogLine({ seq: index + 1 }));
}
