import type { JSX } from "react";

import { formatDateTime } from "@/lib/format.js";
import type { FlowVersionSummary } from "@/shared/flow_types.js";
import { versionLabel } from "@/web/app/flows/use_version_comparison.js";
import { cn } from "@/web/components/ui/cn.js";

const NO_NOTE_LABEL = "Sem nota";

export function VersionList({
    versions,
    selectedVersion,
    onSelect,
}: {
    versions: FlowVersionSummary[];
    selectedVersion: number;
    onSelect: (version: number) => void;
}): JSX.Element {
    const newestFirst = [...versions].reverse();

    return (
        <ul
            aria-label="Versões publicadas"
            className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface"
        >
            {newestFirst.map((version) => (
                <li key={version.version}>
                    <VersionListEntry
                        version={version}
                        isSelected={version.version === selectedVersion}
                        onSelect={() => onSelect(version.version)}
                    />
                </li>
            ))}
        </ul>
    );
}

function VersionListEntry({
    version,
    isSelected,
    onSelect,
}: {
    version: FlowVersionSummary;
    isSelected: boolean;
    onSelect: () => void;
}): JSX.Element {
    return (
        <button
            type="button"
            aria-pressed={isSelected}
            onClick={onSelect}
            className={cn(
                "flex w-full flex-col gap-0.5 border-b border-border px-3 py-2 text-left",
                isSelected ? "bg-surface-raised" : "hover:bg-surface-raised",
            )}
        >
            <span className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{versionLabel(version.version)}</span>
                <span className="text-xs text-muted">
                    {formatDateTime(new Date(version.publishedAt))}
                </span>
            </span>
            <span className="truncate text-xs text-muted">{version.note ?? NO_NOTE_LABEL}</span>
        </button>
    );
}
