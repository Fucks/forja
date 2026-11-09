import { ArrowDownToLine, ScrollText } from "lucide-react";
import { useRef } from "react";
import type { JSX, KeyboardEvent } from "react";

import { Button } from "@/web/components/ui/button.js";
import { EmptyState } from "@/web/components/ui/empty_state.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";
import { LogLineList } from "@/web/logs/log_line_list.js";
import { LogToolbar } from "@/web/logs/log_toolbar.js";
import type { LogLine } from "@/web/logs/log_types.js";
import { useExpandedLines } from "@/web/logs/use_expanded_lines.js";
import { useLogFollow } from "@/web/logs/use_log_follow.js";
import { useLogSearch } from "@/web/logs/use_log_search.js";
import { useLogVirtualizer } from "@/web/logs/use_log_virtualizer.js";
import { useMatchNavigation } from "@/web/logs/use_match_navigation.js";

const DEFAULT_EMPTY_LABEL = "Nenhum log por enquanto";
const FIND_SHORTCUT_KEY = "f";
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
    const searchInputRef = useRef<HTMLInputElement>(null);
    const virtualizer = useLogVirtualizer(lines, scrollElementRef);
    const expandedLines = useExpandedLines();
    const following = useLogFollow({
        follow,
        onFollowChange,
        lineCount: lines.length,
        virtualizer,
    });
    const search = useLogSearch(lines);
    const goToMatch = useMatchNavigation({ lines, search, following, expandedLines, virtualizer });

    function focusSearchOnFindShortcut(event: KeyboardEvent<HTMLDivElement>): void {
        if (!isFindShortcut(event)) {
            return;
        }

        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
    }

    return (
        <div
            onKeyDown={focusSearchOnFindShortcut}
            className="flex h-full min-h-0 flex-col bg-canvas font-mono text-sm leading-normal"
        >
            <LogToolbar
                search={search}
                searchInputRef={searchInputRef}
                onGoToMatch={goToMatch}
                isFollowing={following.isFollowing}
                onFollowChange={following.setFollowing}
            />
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
            <div className="relative flex min-h-0 flex-1 flex-col">
                <LogLineList
                    lines={lines}
                    virtualizer={virtualizer}
                    scrollElementRef={scrollElementRef}
                    expandedLines={expandedLines}
                    onScroll={following.trackScroll}
                    searchQuery={search.query}
                    selectedMatchSeq={search.selectedMatchSeq}
                />
                {!following.isFollowing && (
                    <GoToEndButton onClick={() => following.setFollowing(true)} />
                )}
            </div>
        );
    }
}

function isFindShortcut(event: KeyboardEvent): boolean {
    const hasCommandModifier = event.ctrlKey || event.metaKey;
    return hasCommandModifier && event.key.toLowerCase() === FIND_SHORTCUT_KEY;
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

function GoToEndButton({ onClick }: { onClick: () => void }): JSX.Element {
    return (
        <Button className="absolute right-4 bottom-4 font-sans shadow-float" onClick={onClick}>
            <ArrowDownToLine aria-hidden className="size-4" />
            Ir para o fim
        </Button>
    );
}
