import { ScrollText } from "lucide-react";
import { useRef } from "react";
import type { JSX } from "react";

import { EmptyState } from "@/web/components/ui/empty_state.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";
import { LogLineList } from "@/web/logs/log_line_list.js";
import type { LogLine } from "@/web/logs/log_types.js";
import { useExpandedLines } from "@/web/logs/use_expanded_lines.js";
import { useLogFollow } from "@/web/logs/use_log_follow.js";
import { useLogVirtualizer } from "@/web/logs/use_log_virtualizer.js";

const DEFAULT_EMPTY_LABEL = "Nenhum log por enquanto";
const LOADING_ROW_WIDTHS = ["w-3/4", "w-1/2", "w-2/3", "w-5/6", "w-1/3", "w-3/5"];

export interface LogViewerProps {
    lines: LogLine[];
    follow?: boolean;
    onFollowChange?: (isFollowing: boolean) => void;
    onDownloadRaw?: () => void;
    emptyLabel?: string;
    loading?: boolean;
}

export function LogViewer({
    lines,
    follow,
    onFollowChange,
    emptyLabel = DEFAULT_EMPTY_LABEL,
    loading = false,
}: LogViewerProps): JSX.Element {
    const scrollElementRef = useRef<HTMLDivElement>(null);
    const virtualizer = useLogVirtualizer(lines, scrollElementRef);
    const expandedLines = useExpandedLines();
    useLogFollow({ follow, onFollowChange, lineCount: lines.length, virtualizer });

    return (
        <div className="flex h-full min-h-0 flex-col bg-canvas font-mono text-sm leading-normal">
            {renderBody()}
        </div>
    );

    function renderBody(): JSX.Element {
        if (loading) {
            return <LogLinesPlaceholder />;
        }

        if (lines.length === 0) {
            return <EmptyState icon={ScrollText} title={emptyLabel} />;
        }

        return (
            <LogLineList
                lines={lines}
                virtualizer={virtualizer}
                scrollElementRef={scrollElementRef}
                expandedLines={expandedLines}
            />
        );
    }
}

function LogLinesPlaceholder(): JSX.Element {
    return (
        <div role="status" aria-label="Carregando logs" className="flex flex-col gap-2 p-3">
            {LOADING_ROW_WIDTHS.map((width) => (
                <Skeleton key={width} className={`h-4 ${width}`} />
            ))}
        </div>
    );
}
