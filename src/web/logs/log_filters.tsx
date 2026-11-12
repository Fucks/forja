import type { JSX } from "react";

import { SegmentedControl } from "@/web/components/ui/segmented_control.js";
import type { LogLine } from "@/web/logs/log_types.js";

export type LogFilter = "text_and_tools" | "text_only" | "raw";

export const DEFAULT_LOG_FILTER: LogFilter = "text_and_tools";

const LOG_FILTER_OPTIONS: { value: LogFilter; label: string }[] = [
    { value: "text_and_tools", label: "Texto e ferramentas" },
    { value: "text_only", label: "Só texto" },
    { value: "raw", label: "Bruto" },
];

const SHOWS_LINE: Record<LogFilter, (line: LogLine) => boolean> = {
    text_and_tools: (line) => !line.isRawOutput,
    text_only: (line) => line.kind === "text" || line.kind === "error",
    raw: () => true,
};

export function filterLogLines(lines: LogLine[], filter: LogFilter): LogLine[] {
    return lines.filter(SHOWS_LINE[filter]);
}

export function LogFilterControl({
    value,
    onChange,
}: {
    value: LogFilter;
    onChange: (filter: LogFilter) => void;
}): JSX.Element {
    return (
        <SegmentedControl
            label="Tipos de evento"
            value={value}
            onChange={onChange}
            options={LOG_FILTER_OPTIONS}
        />
    );
}
