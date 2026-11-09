import type { Virtualizer } from "@tanstack/react-virtual";
import type { JSX, RefObject } from "react";

import { LogLine } from "@/web/logs/log_line.js";
import type { LogLine as LogLineEntry } from "@/web/logs/log_types.js";
import type { ExpandedLines } from "@/web/logs/use_expanded_lines.js";

export function LogLineList({
    lines,
    virtualizer,
    scrollElementRef,
    expandedLines,
}: {
    lines: LogLineEntry[];
    virtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>;
    scrollElementRef: RefObject<HTMLDivElement | null>;
    expandedLines: ExpandedLines;
}): JSX.Element {
    return (
        <div
            ref={scrollElementRef}
            role="log"
            aria-label="Logs"
            tabIndex={0}
            className="min-h-0 flex-1 overflow-y-auto outline-none"
        >
            <div
                role="list"
                className="relative w-full"
                style={{ height: virtualizer.getTotalSize() }}
            >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                    const line = lines[virtualRow.index];
                    if (!line) {
                        return null;
                    }

                    return (
                        <div
                            key={virtualRow.key}
                            className="absolute top-0 left-0 w-full"
                            style={{ transform: `translateY(${virtualRow.start}px)` }}
                        >
                            <LogLine
                                line={line}
                                index={virtualRow.index}
                                measureRef={virtualizer.measureElement}
                                isExpanded={expandedLines.isExpanded(line.seq)}
                                onToggleExpanded={expandedLines.toggle}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
