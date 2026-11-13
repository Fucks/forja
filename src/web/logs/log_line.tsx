import { clsx } from "clsx";
import { ChevronRight, Copy } from "lucide-react";
import { memo } from "react";
import type { JSX, ReactNode, Ref } from "react";

import { formatRelativeOffset } from "@/lib/format.js";
import { IconButton } from "@/web/components/ui/icon_button.js";
import { copyToClipboard, formatLineForClipboard } from "@/web/logs/log_clipboard.js";
import { HighlightedText } from "@/web/logs/highlighted_text.js";
import type {
    LogLine as LogLineEntry,
    LogLineKind,
    LogLineRenderer,
} from "@/web/logs/log_types.js";

const KIND_TEXT_CLASSES: Record<LogLineKind, string> = {
    text: "text-text",
    tool_call: "text-text",
    tool_result: "text-muted",
    error: "text-text",
    system: "text-muted",
    usage: "text-muted",
};

// The list re-renders on every appended line and every scroll; a visible line renders again only
// when its own props change.
export const LogLine = memo(function LogLine({
    line,
    index,
    measureRef,
    isExpanded,
    onToggleExpanded,
    searchQuery,
    isSelectedMatch,
    renderLine,
}: {
    line: LogLineEntry;
    index: number;
    measureRef: Ref<HTMLDivElement>;
    isExpanded: boolean;
    onToggleExpanded: (seq: number) => void;
    searchQuery: string;
    isSelectedMatch: boolean;
    renderLine: LogLineRenderer;
}): JSX.Element {
    const summary = <LineSummary line={line} searchQuery={searchQuery} renderLine={renderLine} />;

    return (
        <div
            ref={measureRef}
            role="listitem"
            data-index={index}
            aria-current={isSelectedMatch || undefined}
            className={clsx(
                "group flex gap-3 border-l-2 px-3 hover:bg-surface",
                line.kind === "error" ? "border-status-failed" : "border-transparent",
                isSelectedMatch && "bg-surface-raised",
            )}
        >
            <span className="shrink-0 text-muted">{formatRelativeOffset(line.offsetMs)}</span>
            <div className={clsx("min-w-0 flex-1", KIND_TEXT_CLASSES[line.kind])}>
                {line.detail === undefined ? (
                    summary
                ) : (
                    <ExpandableLine
                        summary={summary}
                        detail={line.detail}
                        searchQuery={searchQuery}
                        isExpanded={isExpanded}
                        onToggle={() => onToggleExpanded(line.seq)}
                    />
                )}
            </div>
            <IconButton
                label="Copiar linha"
                icon={Copy}
                onClick={() => void copyToClipboard(formatLineForClipboard(line))}
                className="h-5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            />
        </div>
    );
});

function ExpandableLine({
    summary,
    detail,
    searchQuery,
    isExpanded,
    onToggle,
}: {
    summary: ReactNode;
    detail: string;
    searchQuery: string;
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
                {summary}
            </button>
            {isExpanded && (
                <pre className="py-1 pl-4.5 break-words whitespace-pre-wrap text-muted">
                    <HighlightedText text={detail} query={searchQuery} />
                </pre>
            )}
        </>
    );
}

function LineSummary({
    line,
    searchQuery,
    renderLine,
}: {
    line: LogLineEntry;
    searchQuery: string;
    renderLine: LogLineRenderer;
}): JSX.Element {
    return (
        <span className="min-w-0 break-words whitespace-pre-wrap">
            {line.kind === "error" && <span className="sr-only">Erro: </span>}
            {renderLine(line, searchQuery)}
        </span>
    );
}

export function renderLineText(line: LogLineEntry, searchQuery: string): ReactNode {
    return (
        <>
            {line.toolName && <span className="mr-2 font-medium text-steel">{line.toolName}</span>}
            <HighlightedText text={line.text} query={searchQuery} />
        </>
    );
}
