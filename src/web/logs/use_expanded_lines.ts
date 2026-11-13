import { useCallback, useState } from "react";

export interface ExpandedLines {
    isExpanded: (seq: number) => boolean;
    toggle: (seq: number) => void;
    expand: (seq: number) => void;
}

export function useExpandedLines(): ExpandedLines {
    const [expandedSeqs, setExpandedSeqs] = useState<ReadonlySet<number>>(new Set());

    // Stable across renders, so memoized log lines are not re-rendered by a new callback.
    const toggle = useCallback((seq: number): void => {
        setExpandedSeqs((current) => {
            const next = new Set(current);
            if (next.has(seq)) {
                next.delete(seq);
            } else {
                next.add(seq);
            }
            return next;
        });
    }, []);
    const expand = useCallback((seq: number): void => {
        setExpandedSeqs((current) => new Set(current).add(seq));
    }, []);

    return { isExpanded: (seq) => expandedSeqs.has(seq), toggle, expand };
}
