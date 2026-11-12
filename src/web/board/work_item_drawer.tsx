import type { JSX, ReactNode } from "react";
import { Link } from "react-router";

import { formatUsd } from "@/lib/format.js";
import type { BoardCard, ItemTimeline as ItemTimelineData } from "@/shared/board_types.js";
import type { ManualColumn, WorkItem, WorkItemState } from "@/shared/work_item_types.js";
import { ItemTimeline } from "@/web/board/item_timeline.js";
import { useItemTimeline, useMoveItemToColumn } from "@/web/board/use_board.js";
import { itemReference, PullRequestLink } from "@/web/board/work_item_card.js";
import { Button } from "@/web/components/ui/button.js";
import { Drawer } from "@/web/components/ui/drawer.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";
import { useFailureToast } from "@/web/components/ui/toast.js";
import { runPath } from "@/web/config/navigation.js";

const ITEM_STATE_LABELS: Record<WorkItemState, string> = {
    open: "Aberta",
    closed: "Fechada",
};

// The board column ids of the manual columns are the column names themselves.
const MANUAL_MOVES: { column: ManualColumn; label: string }[] = [
    { column: "needs_human", label: "Mover para Precisa de humano" },
    { column: "done", label: "Mover para Concluído" },
];

export function WorkItemDrawer({
    projectId,
    card,
    blockers,
    onClose,
}: {
    projectId: string;
    card: BoardCard;
    blockers: WorkItem[];
    onClose: () => void;
}): JSX.Element {
    return (
        <Drawer open onOpenChange={onClose} side="right" title={card.item.title}>
            <div className="flex flex-col gap-5 text-sm">
                <ItemHeader projectId={projectId} card={card} />
                <ManualColumnActions projectId={projectId} card={card} />
                <ItemDescription item={card.item} />
                <BlockerList blockers={blockers} />
                <ItemHistory projectId={projectId} itemId={card.item.id} />
            </div>
        </Drawer>
    );
}

function ItemHeader({ projectId, card }: { projectId: string; card: BoardCard }): JSX.Element {
    return (
        <div className="flex items-center gap-3 text-xs text-muted">
            <ItemReferenceLink item={card.item} />
            <span>{ITEM_STATE_LABELS[card.item.state]}</span>
            {card.runId && (
                <Link
                    to={runPath(projectId, card.runId)}
                    className="ml-auto text-steel hover:underline"
                >
                    Abrir run
                </Link>
            )}
        </div>
    );
}

function ItemReferenceLink({ item }: { item: WorkItem }): JSX.Element {
    if (!item.url) {
        return <span className="font-mono">{itemReference(item)}</span>;
    }

    return (
        <a href={item.url} target="_blank" rel="noreferrer" className="font-mono hover:underline">
            {itemReference(item)}
        </a>
    );
}

function ManualColumnActions({
    projectId,
    card,
}: {
    projectId: string;
    card: BoardCard;
}): JSX.Element {
    const moveItem = useMoveItemToColumn(projectId);
    const showFailure = useFailureToast();
    const movesToOtherColumns = MANUAL_MOVES.filter((move) => move.column !== card.columnId);

    const moveAndReportFailure = (column: ManualColumn): void =>
        moveItem.mutate(
            { itemId: card.item.id, column },
            { onError: (error) => showFailure("Não foi possível mover o item.", error) },
        );

    return (
        <div className="flex flex-wrap gap-2">
            {movesToOtherColumns.map((move) => (
                <Button
                    key={move.column}
                    loading={moveItem.isPending && moveItem.variables?.column === move.column}
                    onClick={() => moveAndReportFailure(move.column)}
                >
                    {move.label}
                </Button>
            ))}
        </div>
    );
}

function ItemDescription({ item }: { item: WorkItem }): JSX.Element | null {
    if (item.body.trim() === "") {
        return null;
    }

    return (
        <DrawerSection title="Descrição">
            <p className="whitespace-pre-wrap">{item.body}</p>
        </DrawerSection>
    );
}

function BlockerList({ blockers }: { blockers: WorkItem[] }): JSX.Element | null {
    if (blockers.length === 0) {
        return null;
    }

    return (
        <DrawerSection title="Bloqueado por">
            <ul aria-label="Bloqueado por" className="flex flex-col gap-1">
                {blockers.map((blocker) => (
                    <li key={blocker.id}>
                        <span className="font-mono text-muted">{itemReference(blocker)}</span>{" "}
                        {blocker.title}
                    </li>
                ))}
            </ul>
        </DrawerSection>
    );
}

function ItemHistory({ projectId, itemId }: { projectId: string; itemId: string }): JSX.Element {
    const timelineQuery = useItemTimeline(projectId, itemId);

    if (timelineQuery.isError) {
        return <p role="alert">Não foi possível carregar a linha do tempo.</p>;
    }
    if (timelineQuery.isPending) {
        return <Skeleton className="h-32" />;
    }

    return <TimelineDetails projectId={projectId} timeline={timelineQuery.data} />;
}

function TimelineDetails({
    projectId,
    timeline,
}: {
    projectId: string;
    timeline: ItemTimelineData;
}): JSX.Element {
    return (
        <>
            <div className="flex items-center gap-3 text-xs">
                <span className="text-muted">Custo total</span>
                <span className="font-mono">{formatUsd(timeline.totalCostUsd)}</span>
                {timeline.prUrl && <PullRequestLink url={timeline.prUrl} />}
            </div>
            {timeline.spec && (
                <details>
                    <summary className="cursor-pointer font-semibold">Especificação do TL</summary>
                    <p className="mt-2 whitespace-pre-wrap">{timeline.spec}</p>
                </details>
            )}
            <DrawerSection title="Linha do tempo">
                <ItemTimeline projectId={projectId} entries={timeline.entries} />
            </DrawerSection>
        </>
    );
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }): JSX.Element {
    return (
        <section className="flex flex-col gap-2">
            <h3 className="font-semibold">{title}</h3>
            {children}
        </section>
    );
}
