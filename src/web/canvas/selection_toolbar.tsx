import type { JSX } from "react";

import { GROUP_KIND_ICONS } from "@/web/canvas/base/group_frame.js";
import type { GroupingVerdict, GroupKind } from "@/web/canvas/grouping.js";
import { GROUPING_SHORTCUT_LABELS } from "@/web/canvas/use_grouping_shortcuts.js";
import { Button } from "@/web/components/ui/button.js";
import { Tooltip } from "@/web/components/ui/tooltip.js";

const GROUP_ACTION_LABELS: Record<GroupKind, string> = {
    map: "Agrupar em map",
    loop: "Agrupar em loop",
};
const GROUP_KINDS: GroupKind[] = ["map", "loop"];

// aria-disabled instead of disabled: a refused action still takes focus, so its tooltip tells why.
const REFUSED_ACTION_CLASSES = "aria-disabled:cursor-not-allowed aria-disabled:opacity-50";

export function SelectionToolbar({
    verdict,
    onGroup,
}: {
    verdict: GroupingVerdict;
    onGroup: (kind: GroupKind) => void;
}): JSX.Element {
    return (
        <div
            role="toolbar"
            aria-label="Seleção"
            className="flex gap-1 rounded-md border border-border bg-surface p-1 shadow-float"
        >
            {GROUP_KINDS.map((kind) => (
                <GroupActionButton key={kind} kind={kind} verdict={verdict} onGroup={onGroup} />
            ))}
        </div>
    );
}

function GroupActionButton({
    kind,
    verdict,
    onGroup,
}: {
    kind: GroupKind;
    verdict: GroupingVerdict;
    onGroup: (kind: GroupKind) => void;
}): JSX.Element {
    const KindIcon = GROUP_KIND_ICONS[kind];
    const tooltip = verdict.ok ? `Atalho: ${GROUPING_SHORTCUT_LABELS[kind]}` : verdict.reason;
    function groupWhenAllowed(): void {
        if (verdict.ok) {
            onGroup(kind);
        }
    }

    return (
        <Tooltip content={tooltip}>
            <Button
                variant="ghost"
                size="sm"
                aria-disabled={!verdict.ok}
                className={REFUSED_ACTION_CLASSES}
                onClick={groupWhenAllowed}
            >
                <KindIcon aria-hidden className="size-4" />
                {GROUP_ACTION_LABELS[kind]}
            </Button>
        </Tooltip>
    );
}
