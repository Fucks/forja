export type LogLineKind = "text" | "tool_call" | "tool_result" | "error" | "system" | "usage";

export interface LogLine {
    seq: number;
    offsetMs: number;
    kind: LogLineKind;
    text: string;
    detail?: string;
    toolName?: string;
    isRawOutput?: boolean;
}
