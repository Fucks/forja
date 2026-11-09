import { useMemo, useState } from "react";

import { findMatches } from "@/web/logs/log_search.js";
import type { LogLine } from "@/web/logs/log_types.js";

export interface LogSearch {
    query: string;
    matchSeqs: number[];
    selectedMatchSeq: number | null;
    changeQuery: (query: string) => void;
    selectMatch: (seq: number) => void;
}

export function useLogSearch(lines: LogLine[]): LogSearch {
    const [query, setQuery] = useState("");
    const [selectedMatchSeq, setSelectedMatchSeq] = useState<number | null>(null);
    const matchSeqs = useMemo(() => findMatches(lines, query), [lines, query]);

    function changeQuery(nextQuery: string): void {
        setQuery(nextQuery);
        setSelectedMatchSeq(null);
    }

    return { query, matchSeqs, selectedMatchSeq, changeQuery, selectMatch: setSelectedMatchSeq };
}
