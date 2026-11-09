import type { JSX } from "react";

import { splitByQuery } from "@/web/logs/log_search.js";

export function HighlightedText({ text, query }: { text: string; query: string }): JSX.Element {
    return (
        <>
            {splitByQuery(text, query).map((segment, position) =>
                segment.isMatch ? (
                    <mark key={position} className="rounded-sm bg-accent/30 text-text">
                        {segment.text}
                    </mark>
                ) : (
                    segment.text
                ),
            )}
        </>
    );
}
