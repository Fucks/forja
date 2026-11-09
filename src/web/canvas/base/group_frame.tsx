import { Repeat, Split } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { JSX } from "react";

import { InvalidMarker, outlineClasses } from "@/web/canvas/base/canvas_outline.js";
import { cn } from "@/web/components/ui/cn.js";

type GroupKind = "loop" | "map";

interface GroupProgress {
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
}

export interface GroupFrameProps {
    kind: GroupKind;
    label: string;
    configLabel: string;
    progress?: GroupProgress;
    selected?: boolean;
    invalid?: boolean;
}

const GROUP_KIND_ICONS: Record<GroupKind, LucideIcon> = {
    loop: Repeat,
    map: Split,
};

const KIND_ICON_SIZE_PX = 14;
const COUNTER_SEPARATOR = " · ";

export function GroupFrame({
    kind,
    label,
    configLabel,
    progress,
    selected,
    invalid,
}: GroupFrameProps): JSX.Element {
    const KindIcon = GROUP_KIND_ICONS[kind];

    return (
        <div
            role="group"
            aria-label={label}
            className={cn(
                "h-full w-full rounded-md border-dashed",
                outlineClasses({ selected, invalid }),
            )}
        >
            <div className="flex flex-col gap-1 px-3 py-2 text-xs">
                <div className="flex items-center gap-2 whitespace-nowrap">
                    <KindIcon size={KIND_ICON_SIZE_PX} aria-hidden="true" className="text-steel" />
                    <span className="font-medium text-text">{label}</span>
                    <span className="font-mono text-muted">{configLabel}</span>
                    {invalid && <InvalidMarker />}
                </div>
                {progress && <span className="text-muted">{formatGroupProgress(progress)}</span>}
            </div>
        </div>
    );
}

function formatGroupProgress({ queued, running, succeeded, failed }: GroupProgress): string {
    const counters = [
        { count: running, text: `${running} rodando` },
        { count: queued, text: `${queued} na fila` },
        { count: succeeded, text: `${succeeded} ${succeeded === 1 ? "feito" : "feitos"}` },
        { count: failed, text: `${failed} com falha` },
    ];

    return counters
        .filter(({ count }) => count > 0)
        .map(({ text }) => text)
        .join(COUNTER_SEPARATOR);
}
