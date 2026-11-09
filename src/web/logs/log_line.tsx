import { clsx } from "clsx";
import type { JSX, Ref } from "react";

import { formatRelativeOffset } from "@/lib/format.js";
import type { LogLine as LogLineEntry, LogLineKind } from "@/web/logs/log_types.js";

const KIND_TEXT_CLASSES: Record<LogLineKind, string> = {
    text: "text-text",
    tool_call: "text-text",
    tool_result: "text-muted",
    error: "text-text",
    system: "text-muted",
    usage: "text-muted",
};

export function LogLine({
    line,
    index,
    measureRef,
}: {
    line: LogLineEntry;
    index: number;
    measureRef: Ref<HTMLDivElement>;
}): JSX.Element {
    return (
        <div
            ref={measureRef}
            role="listitem"
            data-index={index}
            className={clsx(
                "flex gap-3 border-l-2 px-3",
                line.kind === "error" ? "border-status-failed" : "border-transparent",
            )}
        >
            <span className="shrink-0 text-muted">{formatRelativeOffset(line.offsetMs)}</span>
            <span
                className={clsx(
                    "min-w-0 flex-1 break-words whitespace-pre-wrap",
                    KIND_TEXT_CLASSES[line.kind],
                )}
            >
                {line.text}
            </span>
        </div>
    );
}
