import { GitPullRequest } from "lucide-react";
import type { JSX } from "react";

import { formatUsd } from "@/lib/format.js";
import type { BoardCard } from "@/shared/board_types.js";
import type { WorkItem } from "@/shared/work_item_types.js";
import { StatusBadge } from "@/web/components/ui/status_badge.js";

const PR_ICON_SIZE_PX = 14;

export function WorkItemCard({ card }: { card: BoardCard }): JSX.Element {
    return (
        <article
            aria-label={card.item.title}
            className="flex animate-card-enter flex-col gap-2 rounded-md border border-border bg-surface p-3"
        >
            <h3 className="line-clamp-2 text-sm font-medium">{card.item.title}</h3>
            <CurrentStep card={card} />
            <div className="flex items-center gap-2 text-xs text-muted">
                <span className="font-mono">{itemReference(card.item)}</span>
                {card.prUrl && <PullRequestLink url={card.prUrl} />}
                {card.costUsd !== undefined && (
                    <span className="ml-auto">{formatUsd(card.costUsd)}</span>
                )}
            </div>
        </article>
    );
}

function CurrentStep({ card }: { card: BoardCard }): JSX.Element | null {
    if (!card.status || !card.currentNodeLabel) {
        return null;
    }

    return (
        <div className="flex items-center gap-1.5 text-xs">
            <span>{card.currentNodeLabel} ·</span>
            <StatusBadge status={card.status} size="sm" />
        </div>
    );
}

function PullRequestLink({ url }: { url: string }): JSX.Element {
    return (
        <a href={url} target="_blank" rel="noreferrer" aria-label="Pull request">
            <GitPullRequest size={PR_ICON_SIZE_PX} aria-hidden="true" className="text-steel" />
        </a>
    );
}

function itemReference(item: WorkItem): string {
    return item.number === undefined ? "local" : `#${item.number}`;
}
