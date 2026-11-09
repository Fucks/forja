import { clsx } from "clsx";
import { ChevronRight } from "lucide-react";
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
    isExpanded,
    onToggleExpanded,
}: {
    line: LogLineEntry;
    index: number;
    measureRef: Ref<HTMLDivElement>;
    isExpanded: boolean;
    onToggleExpanded: (seq: number) => void;
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
            <div className={clsx("min-w-0 flex-1", KIND_TEXT_CLASSES[line.kind])}>
                {line.detail === undefined ? (
                    <LineSummary line={line} />
                ) : (
                    <ExpandableLine
                        line={line}
                        detail={line.detail}
                        isExpanded={isExpanded}
                        onToggle={() => onToggleExpanded(line.seq)}
                    />
                )}
            </div>
        </div>
    );
}

function ExpandableLine({
    line,
    detail,
    isExpanded,
    onToggle,
}: {
    line: LogLineEntry;
    detail: string;
    isExpanded: boolean;
    onToggle: () => void;
}): JSX.Element {
    return (
        <>
            <button
                type="button"
                aria-expanded={isExpanded}
                onClick={onToggle}
                className="flex w-full items-start gap-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
                <ChevronRight
                    aria-hidden
                    className={clsx(
                        "mt-0.5 size-3.5 shrink-0 transition-transform",
                        isExpanded && "rotate-90",
                    )}
                />
                <LineSummary line={line} />
            </button>
            {isExpanded && (
                <pre className="py-1 pl-4.5 break-words whitespace-pre-wrap text-muted">
                    {detail}
                </pre>
            )}
        </>
    );
}

function LineSummary({ line }: { line: LogLineEntry }): JSX.Element {
    return (
        <span className="min-w-0 break-words whitespace-pre-wrap">
            {line.kind === "error" && <span className="sr-only">Erro: </span>}
            {line.toolName && <span className="mr-2 font-medium text-steel">{line.toolName}</span>}
            {line.text}
        </span>
    );
}
