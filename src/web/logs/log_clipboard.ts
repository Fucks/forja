import { formatRelativeOffset } from "@/lib/format.js";
import type { LogLine } from "@/web/logs/log_types.js";

export function formatLineForClipboard(line: LogLine): string {
    return formatLine(line, { includeDetail: true });
}

export function formatLinesForClipboard(
    lines: LogLine[],
    isExpanded: (seq: number) => boolean,
): string {
    return lines
        .map((line) => formatLine(line, { includeDetail: isExpanded(line.seq) }))
        .join("\n");
}

export async function copyToClipboard(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
}

function formatLine(line: LogLine, options: { includeDetail: boolean }): string {
    const summary = [formatRelativeOffset(line.offsetMs), line.toolName, line.text]
        .filter((part) => part !== undefined)
        .join(" ");
    if (!options.includeDetail || line.detail === undefined) {
        return summary;
    }

    return `${summary}\n${line.detail}`;
}
