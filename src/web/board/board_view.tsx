import { Plus, RefreshCw, Zap } from "lucide-react";
import { useState } from "react";
import type { JSX } from "react";

import type { BoardColumnDef } from "@/engine/board_columns.js";
import type { BoardCard, BoardView } from "@/shared/board_types.js";
import type { WorkItem } from "@/shared/work_item_types.js";
import type { CreateEventSource } from "@/web/api/use_event_stream.js";
import { BoardDragAndDrop, DraggableCard, useColumnDropTarget } from "@/web/board/board_dnd.js";
import type { ColumnDropState } from "@/web/board/board_dnd.js";
import { findBlockers } from "@/web/board/board_lookups.js";
import { NewItemDialog } from "@/web/board/new_item_dialog.js";
import { useBoard, useSyncBoard } from "@/web/board/use_board.js";
import { WorkItemDrawer } from "@/web/board/work_item_drawer.js";
import { Button } from "@/web/components/ui/button.js";
import { cn } from "@/web/components/ui/cn.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";
import { useToast } from "@/web/components/ui/toast.js";

const TOOLBAR_ICON_SIZE_PX = 14;
const TRIGGER_ICON_SIZE_PX = 14;

const DROP_STATE_CLASSES: Record<ColumnDropState, string> = {
    idle: "border-transparent",
    allowed: "border-accent",
    forbidden: "border-transparent opacity-40",
};

export function ProjectBoard({
    projectId,
    createEventSource,
}: {
    projectId: string;
    createEventSource?: CreateEventSource;
}): JSX.Element {
    const boardQuery = useBoard(projectId, createEventSource);

    return (
        <div className="flex min-h-0 flex-col gap-4">
            <div className="flex gap-2">
                <NewItemButton
                    projectId={projectId}
                    blockerCandidates={listOpenItems(boardQuery.data)}
                />
                <SyncButton projectId={projectId} />
            </div>
            {boardQuery.isError && <p role="alert">Não foi possível carregar o board.</p>}
            {boardQuery.isPending && <Skeleton className="h-64" />}
            {boardQuery.isSuccess && <BoardColumns projectId={projectId} board={boardQuery.data} />}
        </div>
    );
}

function NewItemButton({
    projectId,
    blockerCandidates,
}: {
    projectId: string;
    blockerCandidates: WorkItem[];
}): JSX.Element {
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    return (
        <>
            <Button variant="primary" onClick={() => setIsDialogOpen(true)}>
                <Plus size={TOOLBAR_ICON_SIZE_PX} aria-hidden="true" />
                Novo item
            </Button>
            <NewItemDialog
                projectId={projectId}
                blockerCandidates={blockerCandidates}
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
            />
        </>
    );
}

function SyncButton({ projectId }: { projectId: string }): JSX.Element {
    const sync = useSyncBoard(projectId);
    const toast = useToast();

    const syncAndReportFailure = (): void =>
        sync.mutate(undefined, {
            onError: (error) =>
                toast.show({
                    tone: "error",
                    title: "Não foi possível sincronizar.",
                    description: error.message,
                }),
        });

    return (
        <Button loading={sync.isPending} onClick={syncAndReportFailure}>
            {!sync.isPending && <RefreshCw size={TOOLBAR_ICON_SIZE_PX} aria-hidden="true" />}
            Sincronizar
        </Button>
    );
}

function listOpenItems(board: BoardView | undefined): WorkItem[] {
    const items = board?.cards.map((card) => card.item) ?? [];
    return items.filter((item) => item.state === "open");
}

function BoardColumns({ projectId, board }: { projectId: string; board: BoardView }): JSX.Element {
    const [openItemId, setOpenItemId] = useState<string>();
    const openCard = board.cards.find((card) => card.item.id === openItemId);

    return (
        <>
            {board.flowId === undefined && (
                <p role="status" className="text-muted">
                    Publique um fluxo padrão para ver as etapas do projeto no board.
                </p>
            )}
            <BoardDragAndDrop projectId={projectId} board={board}>
                <div className="flex min-h-0 gap-3 overflow-x-auto pb-2">
                    {board.columns.map((column) => (
                        <BoardColumn
                            key={column.id}
                            column={column}
                            cards={board.cards.filter((card) => card.columnId === column.id)}
                            onOpenCard={(card) => setOpenItemId(card.item.id)}
                        />
                    ))}
                </div>
            </BoardDragAndDrop>
            {openCard && (
                <WorkItemDrawer
                    projectId={projectId}
                    card={openCard}
                    blockers={findBlockers(board, openCard.item)}
                    onClose={() => setOpenItemId(undefined)}
                />
            )}
        </>
    );
}

function BoardColumn({
    column,
    cards,
    onOpenCard,
}: {
    column: BoardColumnDef;
    cards: BoardCard[];
    onOpenCard: (card: BoardCard) => void;
}): JSX.Element {
    const { setDropTargetElement, dropState, hasTrigger } = useColumnDropTarget(column);

    return (
        <section
            ref={setDropTargetElement}
            aria-label={column.label}
            data-board-column
            className={cn(
                "flex w-[300px] shrink-0 flex-col gap-2 rounded-md border bg-canvas p-2",
                "transition-[opacity,border-color] duration-150 ease-out",
                DROP_STATE_CLASSES[dropState],
            )}
        >
            <header
                className={cn(
                    "flex items-center gap-1.5 px-1 text-sm font-semibold",
                    column.kind === "needs_human" && "text-status-waiting-approval",
                )}
            >
                {hasTrigger && (
                    <Zap
                        size={TRIGGER_ICON_SIZE_PX}
                        role="img"
                        aria-label="Coluna-gatilho"
                        className="text-accent"
                    />
                )}
                <h2>{column.label}</h2>
                <span className="ml-auto text-xs text-muted">{cards.length}</span>
            </header>
            {cards.map((card) => (
                <DraggableCard key={card.item.id} card={card} onOpen={() => onOpenCard(card)} />
            ))}
        </section>
    );
}
