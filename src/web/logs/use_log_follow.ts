import { useEffect, useRef, useState } from "react";

import type { LogVirtualizer } from "@/web/logs/use_log_virtualizer.js";

// Rows are measured after they mount, so the end can move a few pixels while following.
const END_TOLERANCE_PX = 4;

export interface ScrollPosition {
    scrollTopPx: number;
    distanceFromEndPx: number;
}

export interface LogFollow {
    isFollowing: boolean;
    setFollowing: (isFollowing: boolean) => void;
    trackScroll: (position: ScrollPosition) => void;
}

export function useLogFollow({
    follow,
    onFollowChange,
    lineCount,
    virtualizer,
}: {
    follow: boolean | undefined;
    onFollowChange: ((isFollowing: boolean) => void) | undefined;
    lineCount: number;
    virtualizer: LogVirtualizer;
}): LogFollow {
    const [uncontrolledFollow, setUncontrolledFollow] = useState(true);
    const isFollowing = follow ?? uncontrolledFollow;
    const previousScrollTopPxRef = useRef(0);

    useEffect(() => {
        if (isFollowing && lineCount > 0) {
            virtualizer.scrollToEnd();
        }
    }, [isFollowing, lineCount, virtualizer]);

    function setFollowing(nextIsFollowing: boolean): void {
        if (nextIsFollowing === isFollowing) {
            return;
        }

        setUncontrolledFollow(nextIsFollowing);
        onFollowChange?.(nextIsFollowing);
    }

    function trackScroll(position: ScrollPosition): void {
        const hasScrolledUp = position.scrollTopPx < previousScrollTopPxRef.current;
        previousScrollTopPxRef.current = position.scrollTopPx;

        const hasLeftTheEnd = position.distanceFromEndPx > END_TOLERANCE_PX;
        if (isFollowing && hasScrolledUp && hasLeftTheEnd) {
            setFollowing(false);
        }
    }

    return { isFollowing, setFollowing, trackScroll };
}
