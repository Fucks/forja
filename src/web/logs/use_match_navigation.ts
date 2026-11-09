import { detailContainsQuery, findAdjacentMatch } from "@/web/logs/log_search.js";
import type { MatchDirection } from "@/web/logs/log_search.js";
import type { LogLine } from "@/web/logs/log_types.js";
import type { ExpandedLines } from "@/web/logs/use_expanded_lines.js";
import type { LogFollow } from "@/web/logs/use_log_follow.js";
import type { LogSearch } from "@/web/logs/use_log_search.js";
import type { LogVirtualizer } from "@/web/logs/use_log_virtualizer.js";

export function useMatchNavigation({
    lines,
    search,
    following,
    expandedLines,
    virtualizer,
}: {
    lines: LogLine[];
    search: LogSearch;
    following: LogFollow;
    expandedLines: ExpandedLines;
    virtualizer: LogVirtualizer;
}): (direction: MatchDirection) => void {
    return function goToMatch(direction) {
        const matchSeq = findAdjacentMatch(search.matchSeqs, search.selectedMatchSeq, direction);
        if (matchSeq === null) {
            return;
        }

        search.selectMatch(matchSeq);
        revealLine(matchSeq);
    };

    function revealLine(seq: number): void {
        const index = lines.findIndex((line) => line.seq === seq);
        const line = lines[index];
        if (!line) {
            return;
        }

        following.setFollowing(false);
        if (detailContainsQuery(line, search.query)) {
            expandedLines.expand(seq);
        }
        virtualizer.scrollToIndex(index, { align: "center" });
    }
}
