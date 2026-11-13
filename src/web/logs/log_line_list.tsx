import type { JSX, RefObject, UIEvent } from "react";

import { LogLine } from "@/web/logs/log_line.js";
import type { LogLine as LogLineEntry, LogLineRenderer } from "@/web/logs/log_types.js";
import type { ExpandedLines } from "@/web/logs/use_expanded_lines.js";
import type { ScrollPosition } from "@/web/logs/use_log_follow.js";
import type { LogVirtualizer } from "@/web/logs/use_log_virtualizer.js";

export function LogLineList({
    lines,
    virtualizer,
    scrollElementRef,
    expandedLines,
    onScroll,
    searchQuery,
    selectedMatchSeq,
    renderLine,
}: {
    lines: LogLineEntry[];
    virtualizer: LogVirtualizer;
    scrollElementRef: RefObject<HTMLDivElement | null>;
    expandedLines: ExpandedLines;
    onScroll: (position: ScrollPosition) => void;
    searchQuery: string;
    selectedMatchSeq: number | null;
    renderLine: LogLineRenderer;
}): JSX.Element {
    const virtualRows = virtualizer.getVirtualItems();
    // The rows follow one another, so only the block that holds them moves to the first row.
    const firstRowStartPx = virtualRows[0]?.start ?? 0;

    return (
        <div
            ref={scrollElementRef}
            role="log"
            aria-label="Logs"
            tabIndex={0}
            onScroll={(event) => onScroll(readScrollPosition(event))}
            className="min-h-0 flex-1 overflow-y-auto outline-none"
        >
            <div
                role="list"
                className="relative w-full"
                style={{ height: virtualizer.getTotalSize() }}
            >
                <div
                    className="absolute top-0 left-0 w-full"
                    style={{ transform: `translateY(${firstRowStartPx}px)` }}
                >
                    {virtualRows.map((virtualRow) => {
                        const line = lines[virtualRow.index];
                        if (!line) {
                            return null;
                        }

                        return (
                            <LogLine
                                key={virtualRow.key}
                                line={line}
                                index={virtualRow.index}
                                measureRef={virtualizer.measureElement}
                                isExpanded={expandedLines.isExpanded(line.seq)}
                                onToggleExpanded={expandedLines.toggle}
                                searchQuery={searchQuery}
                                isSelectedMatch={line.seq === selectedMatchSeq}
                                renderLine={renderLine}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function readScrollPosition(event: UIEvent<HTMLDivElement>): ScrollPosition {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    return { scrollTopPx: scrollTop, distanceFromEndPx: scrollHeight - scrollTop - clientHeight };
}
