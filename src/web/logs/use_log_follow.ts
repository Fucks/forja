import { useEffect, useState } from "react";

import type { LogVirtualizer } from "@/web/logs/use_log_virtualizer.js";

export interface LogFollow {
    isFollowing: boolean;
    setFollowing(isFollowing: boolean): void;
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

    useEffect(() => {
        if (isFollowing && lineCount > 0) {
            virtualizer.scrollToEnd();
        }
    }, [isFollowing, lineCount, virtualizer]);

    function setFollowing(nextIsFollowing: boolean): void {
        setUncontrolledFollow(nextIsFollowing);
        onFollowChange?.(nextIsFollowing);
    }

    return { isFollowing, setFollowing };
}
