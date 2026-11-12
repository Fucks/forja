import type { ReactNode } from "react";

import { HighlightedText } from "@/web/logs/highlighted_text.js";
import { renderLineText } from "@/web/logs/log_line.js";
import type { LogLine } from "@/web/logs/log_types.js";
import { TOOL_CALL_MARKER } from "@/web/logs/to_log_lines.js";

export function renderAgentEventLine(line: LogLine, searchQuery: string): ReactNode {
    if (line.kind !== "tool_call") {
        return renderLineText(line, searchQuery);
    }

    return <ToolCallSummary text={line.text} searchQuery={searchQuery} />;
}

function ToolCallSummary({ text, searchQuery }: { text: string; searchQuery: string }): ReactNode {
    const toolName = text.slice(TOOL_CALL_MARKER.length);

    return (
        <>
            <span aria-hidden className="text-muted">
                {TOOL_CALL_MARKER}
            </span>
            <span className="font-medium text-steel">
                <HighlightedText text={toolName} query={searchQuery} />
            </span>
        </>
    );
}
