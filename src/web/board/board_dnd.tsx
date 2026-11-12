import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent, SensorDescriptor, SensorOptions } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { createContext, use, useState } from "react";
import type { JSX, ReactNode } from "react";

import type { BoardColumnDef } from "@/engine/board_columns.js";
import type { BoardCard, BoardView } from "@/shared/board_types.js";
import type { Trigger } from "@/shared/trigger_types.js";
import { useBoardColumnTriggers } from "@/web/app/triggers/use_triggers.js";
import {
    BOARD_SCREEN_READER_INSTRUCTIONS,
    buildBoardAnnouncements,
} from "@/web/board/board_dnd_accessibility.js";
import { moveToNeighborColumn } from "@/web/board/board_keyboard_navigation.js";
import { findBlockers, findCard, findColumn } from "@/web/board/board_lookups.js";
import { decideDrop, listBoardColumnTriggers } from "@/web/board/drop_rules.js";
import type { DropAction } from "@/web/board/drop_rules.js";
import { StartRunDialog } from "@/web/board/start_run_dialog.js";
import { useDropActionApplier } from "@/web/board/use_drop_action_applier.js";
import { itemReference, WorkItemCard } from "@/web/board/work_item_card.js";
import { cn } from "@/web/components/ui/cn.js";

export type ColumnDropState = "idle" | "allowed" | "forbidden";

interface BoardDropContextValue {
    dropStateOf: (column: BoardColumnDef) => ColumnDropState;
    hasTrigger: (column: BoardColumnDef) => boolean;
}

interface RunToConfirm {
    card: BoardCard;
    trigger: Trigger;
}

// A pointer has to travel a little before a drag starts, so a click still opens the card.
const POINTER_ACTIVATION_DISTANCE_PX = 4;
const GRIP_ICON_SIZE_PX = 14;

const BoardDropContext = createContext<BoardDropContextValue>({
    dropStateOf: () => "idle",
    hasTrigger: () => false,
});

export function BoardDragAndDrop({
    projectId,
    board,
    children,
}: {
    projectId: string;
    board: BoardView;
    children: ReactNode;
}): JSX.Element {
    const triggers = useBoardColumnTriggers(projectId).data ?? [];
    const columnTriggers = listBoardColumnTriggers(triggers);
    const [draggedCard, setDraggedCard] = useState<BoardCard>();
    const [runToConfirm, setRunToConfirm] = useState<RunToConfirm>();
    const sensors = useBoardSensors();
    const applyDropAction = useDropActionApplier(projectId, (card, triggerId) => {
        const trigger = triggers.find((candidate) => candidate.id === triggerId);
        if (trigger) {
            setRunToConfirm({ card, trigger });
        }
    });

    const decideDropOn = (card: BoardCard, column: BoardColumnDef): DropAction => {
        const blockerReferences = findBlockers(board, card.item).map(itemReference);
        return decideDrop(card, column, columnTriggers, blockerReferences);
    };

    const startDragging = ({ active }: DragStartEvent): void =>
        setDraggedCard(findCard(board, active.id));

    const dropDraggedCard = ({ active, over }: DragEndEvent): void => {
        setDraggedCard(undefined);
        const card = findCard(board, active.id);
        const column = findColumn(board, over?.id);
        if (!card || !column || column.id === card.columnId) {
            return;
        }
        applyDropAction(card, decideDropOn(card, column));
    };

    const dropContext: BoardDropContextValue = {
        dropStateOf: (column) => describeDropState(draggedCard, column, decideDropOn),
        hasTrigger: (column) => columnTriggers.some((trigger) => trigger.columnId === column.id),
    };

    return (
        <BoardDropContext value={dropContext}>
            <DndContext
                sensors={sensors}
                accessibility={{
                    announcements: buildBoardAnnouncements(board),
                    screenReaderInstructions: BOARD_SCREEN_READER_INSTRUCTIONS,
                }}
                onDragStart={startDragging}
                onDragEnd={dropDraggedCard}
                onDragCancel={() => setDraggedCard(undefined)}
            >
                {children}
            </DndContext>
            {runToConfirm && (
                <StartRunDialog
                    projectId={projectId}
                    card={runToConfirm.card}
                    trigger={runToConfirm.trigger}
                    onClose={() => setRunToConfirm(undefined)}
                />
            )}
        </BoardDropContext>
    );
}

export function useColumnDropTarget(column: BoardColumnDef): {
    setDropTargetElement: (element: HTMLElement | null) => void;
    dropState: ColumnDropState;
    hasTrigger: boolean;
} {
    const { setNodeRef } = useDroppable({ id: column.id });
    const dropContext = use(BoardDropContext);

    return {
        setDropTargetElement: setNodeRef,
        dropState: dropContext.dropStateOf(column),
        hasTrigger: dropContext.hasTrigger(column),
    };
}

// The whole card follows the pointer; the keyboard picks it up only through its handle, so the
// Enter on the title still opens the item.
export function DraggableCard({
    card,
    onOpen,
}: {
    card: BoardCard;
    onOpen: () => void;
}): JSX.Element {
    const { setNodeRef, setActivatorNodeRef, listeners, attributes, transform, isDragging } =
        useDraggable({ id: card.item.id, attributes: { roleDescription: "card arrastável" } });

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            style={{ transform: CSS.Translate.toString(transform) }}
            className={cn("relative", isDragging && "z-10")}
        >
            <WorkItemCard card={card} onOpen={onOpen} />
            <button
                ref={setActivatorNodeRef}
                {...attributes}
                type="button"
                aria-label={`Mover ${card.item.title}`}
                className="absolute top-2 right-2 cursor-grab rounded-sm text-muted hover:text-text"
            >
                <GripVertical size={GRIP_ICON_SIZE_PX} aria-hidden="true" />
            </button>
        </div>
    );
}

function useBoardSensors(): SensorDescriptor<SensorOptions>[] {
    return useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: POINTER_ACTIVATION_DISTANCE_PX },
        }),
        useSensor(KeyboardSensor, { coordinateGetter: moveToNeighborColumn }),
    );
}

function describeDropState(
    draggedCard: BoardCard | undefined,
    column: BoardColumnDef,
    decideDropOn: (card: BoardCard, column: BoardColumnDef) => DropAction,
): ColumnDropState {
    if (!draggedCard || draggedCard.columnId === column.id) {
        return "idle";
    }

    return decideDropOn(draggedCard, column).kind === "not_allowed" ? "forbidden" : "allowed";
}
