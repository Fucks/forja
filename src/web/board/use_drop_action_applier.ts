import { assertNever } from "@/lib/assert_never.js";
import type { BoardCard } from "@/shared/board_types.js";
import type { DropAction } from "@/web/board/drop_rules.js";
import { useMoveItemToColumn } from "@/web/board/use_board.js";
import { useFailureToast, useToast } from "@/web/components/ui/toast.js";

/** Starting a run waits for `confirmRun`; the other actions take effect right away. */
export function useDropActionApplier(
    projectId: string,
    confirmRun: (card: BoardCard, triggerId: string) => void,
): (card: BoardCard, action: DropAction) => void {
    const moveItem = useMoveItemToColumn(projectId);
    const toast = useToast();
    const showFailure = useFailureToast();

    return (card, action) => {
        switch (action.kind) {
            case "start_run":
                return confirmRun(card, action.triggerId);
            case "set_manual_column":
                return moveItem.mutate(
                    { itemId: card.item.id, column: action.column },
                    { onError: (error) => showFailure("Não foi possível mover o item.", error) },
                );
            case "not_allowed":
                return toast.show({ title: "Movimento recusado", description: action.reason });
            default:
                return assertNever(action);
        }
    };
}
