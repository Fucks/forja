import { useVirtualizer } from "@tanstack/react-virtual";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { RefObject } from "react";

import type { LogLine } from "@/web/logs/log_types.js";

const ESTIMATED_ROW_HEIGHT_PX = 20;
const OVERSCAN_ROW_COUNT = 12;

export type LogVirtualizer = Virtualizer<HTMLDivElement, HTMLDivElement>;

export function useLogVirtualizer(
    lines: LogLine[],
    scrollElementRef: RefObject<HTMLDivElement | null>,
): LogVirtualizer {
    return useVirtualizer({
        count: lines.length,
        getScrollElement: () => scrollElementRef.current,
        estimateSize: () => ESTIMATED_ROW_HEIGHT_PX,
        getItemKey: (index) => lines[index]?.seq ?? index,
        overscan: OVERSCAN_ROW_COUNT,
    });
}
