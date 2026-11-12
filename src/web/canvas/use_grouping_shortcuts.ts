import { useEffect, useRef } from "react";

import type { GroupKind } from "@/web/canvas/grouping.js";
import { isTypingTarget } from "@/web/canvas/shortcuts.js";

const SHORTCUT_PREFIX_KEY = "g";
const GROUP_KIND_BY_SECOND_KEY: Partial<Record<string, GroupKind>> = { m: "map", l: "loop" };

export function useGroupingShortcuts(groupSelection: (kind: GroupKind) => void): void {
    const isPrefixPressed = useRef(false);

    useEffect(() => {
        function onKeyDown(event: KeyboardEvent): void {
            if (isTypingTarget(event.target) || hasModifier(event)) {
                return;
            }

            const key = event.key.toLowerCase();
            const kind = isPrefixPressed.current ? GROUP_KIND_BY_SECOND_KEY[key] : undefined;
            isPrefixPressed.current = key === SHORTCUT_PREFIX_KEY;
            if (kind) {
                groupSelection(kind);
            }
        }

        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [groupSelection]);
}

function hasModifier(event: KeyboardEvent): boolean {
    return event.ctrlKey || event.metaKey || event.altKey;
}
