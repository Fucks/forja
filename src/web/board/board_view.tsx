import { RefreshCw } from "lucide-react";
import type { JSX } from "react";

import type { BoardColumnDef } from "@/engine/board_columns.js";
import type { BoardCard, BoardView } from "@/shared/board_types.js";
import { useBoard, useSyncBoard } from "@/web/board/use_board.js";
import type { CreateEventSource } from "@/web/board/use_board.js";
import { WorkItemCard } from "@/web/board/work_item_card.js";
import { Button } from "@/web/components/ui/button.js";
import { cn } from "@/web/components/ui/cn.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";
import { useToast } from "@/web/components/ui/toast.js";

const SYNC_ICON_SIZE_PX = 14;

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
            <SyncButton projectId={projectId} />
            {boardQuery.isError && <p role="alert">Não foi possível carregar o board.</p>}
            {boardQuery.isPending && <Skeleton className="h-64" />}
            {boardQuery.isSuccess && <BoardColumns board={boardQuery.data} />}
        </div>
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
        <Button className="self-start" loading={sync.isPending} onClick={syncAndReportFailure}>
            {!sync.isPending && <RefreshCw size={SYNC_ICON_SIZE_PX} aria-hidden="true" />}
            Sincronizar
        </Button>
    );
}

function BoardColumns({ board }: { board: BoardView }): JSX.Element {
    return (
        <>
            {board.flowId === undefined && (
                <p role="status" className="text-muted">
                    Publique um fluxo padrão para ver as etapas do projeto no board.
                </p>
            )}
            <div className="flex min-h-0 gap-3 overflow-x-auto pb-2">
                {board.columns.map((column) => (
                    <BoardColumn
                        key={column.id}
                        column={column}
                        cards={board.cards.filter((card) => card.columnId === column.id)}
                    />
                ))}
            </div>
        </>
    );
}

function BoardColumn({
    column,
    cards,
}: {
    column: BoardColumnDef;
    cards: BoardCard[];
}): JSX.Element {
    return (
        <section
            aria-label={column.label}
            className="flex w-[300px] shrink-0 flex-col gap-2 rounded-md bg-canvas p-2"
        >
            <header
                className={cn(
                    "flex items-center justify-between px-1 text-sm font-semibold",
                    column.kind === "needs_human" && "text-status-waiting-approval",
                )}
            >
                <h2>{column.label}</h2>
                <span className="text-xs text-muted">{cards.length}</span>
            </header>
            {cards.map((card) => (
                <WorkItemCard key={card.item.id} card={card} />
            ))}
        </section>
    );
}
