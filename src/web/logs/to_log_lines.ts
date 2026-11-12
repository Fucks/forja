import { assertNever } from "@/lib/assert_never.js";
import type { StoredLogEvent } from "@/shared/log_types.js";
import type { LogLine } from "@/web/logs/log_types.js";

export const TOOL_CALL_MARKER = "▸ ";
export const TOOL_RESULT_MARKER = "◂ ";
const JSON_INDENT_SPACES = 2;

// The stream-json parser stores each tool result as a raw line in this shape.
const TOOL_RESULT_LINE = /^\[resultado de (?<toolName>[^\]]+)\] (?<output>.*)$/s;

type LineContent = Omit<LogLine, "seq" | "offsetMs">;

export function toLogLines(events: StoredLogEvent[], startedAt: Date): LogLine[] {
    return events.map((event) => ({
        seq: event.seq,
        offsetMs: offsetFromStartMs(event, startedAt),
        ...describeEvent(event),
    }));
}

function offsetFromStartMs(event: StoredLogEvent, startedAt: Date): number {
    return Math.max(0, new Date(event.at).getTime() - startedAt.getTime());
}

function describeEvent(event: StoredLogEvent): LineContent {
    switch (event.kind) {
        case "text":
            return { kind: "text", text: event.text ?? "" };
        case "tool_call":
            return describeToolCall(event.name ?? "", event.args ?? "");
        case "raw":
            return describeRawLine(event.line ?? "");
        case "system":
            return { kind: "system", text: event.message ?? "" };
        default:
            return assertNever(event.kind);
    }
}

function describeToolCall(toolName: string, args: string): LineContent {
    return { kind: "tool_call", text: TOOL_CALL_MARKER + toolName, detail: indentIfJson(args) };
}

function describeRawLine(line: string): LineContent {
    const toolResult = parseToolResultLine(line);
    if (!toolResult) {
        return { kind: "system", text: line, isRawOutput: true };
    }

    return {
        kind: "tool_result",
        text: `${TOOL_RESULT_MARKER}resultado de ${toolResult.toolName}`,
        detail: indentIfJson(toolResult.output),
    };
}

function parseToolResultLine(line: string): { toolName: string; output: string } | undefined {
    const groups = TOOL_RESULT_LINE.exec(line)?.groups;
    if (groups?.toolName === undefined || groups.output === undefined) {
        return undefined;
    }

    return { toolName: groups.toolName, output: groups.output };
}

function indentIfJson(text: string): string {
    try {
        const parsed: unknown = JSON.parse(text);
        return JSON.stringify(parsed, null, JSON_INDENT_SPACES);
    } catch {
        return text;
    }
}
