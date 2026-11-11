import { useEffect, useRef } from "react";

import type { GroupKind } from "@/web/canvas/grouping.js";

const SHORTCUT_PREFIX_KEY = "g";
const GROUP_KIND_BY_SECOND_KEY: Partial<Record<string, GroupKind>> = { m: "map", l: "loop" };
const TYPING_TAG_NAMES = ["INPUT", "TEXTAREA", "SELECT"];

export const GROUPING_SHORTCUT_LABELS: Record<GroupKind, string> = { map: "G M", loop: "G L" };

// Two-key shortcuts: G then M groups in a map, G then L in a loop.
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

function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    return target.isContentEditable || TYPING_TAG_NAMES.includes(target.tagName);
}

function hasModifier(event: KeyboardEvent): boolean {
    return event.ctrlKey || event.metaKey || event.altKey;
}
