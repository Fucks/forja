import { deriveColumns } from "@/engine/board_columns.js";
import type { BoardColumnDef } from "@/engine/board_columns.js";
import type { BoardCard } from "@/shared/board_types.js";
import type { ListedTrigger } from "@/shared/trigger_types.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { buildWorkItem } from "@/test/factories/work_item_factory.js";
import { decideDrop, listBoardColumnTriggers } from "@/web/board/drop_rules.js";

const COLUMNS = deriveColumns(buildCanonicalFlow());
const SPECIFY_COLUMN = columnWithId("stage:specify");
const DEVELOP_COLUMN = columnWithId("stage:develop");
const BOARD_TRIGGERS = [{ triggerId: "trg_specify", columnId: SPECIFY_COLUMN.id }];

function columnWithId(id: string): BoardColumnDef {
    const column = COLUMNS.find((candidate) => candidate.id === id);
    if (!column) {
        throw new Error(`The canonical flow has no column ${id}`);
    }
    return column;
}

function buildCard(overrides: Partial<BoardCard> = {}): BoardCard {
    return { item: buildWorkItem({ id: "itm_42", number: 42 }), columnId: "backlog", ...overrides };
}

function buildTrigger(overrides: Partial<ListedTrigger> = {}): ListedTrigger {
    return {
        id: "trg_specify",
        projectId: "prj_forja",
        flowId: "flw_sandcastle",
        name: "Ao soltar em Especificar",
        enabled: true,
        policy: "skip",
        itemSelection: "event_items",
        config: { kind: "board_column", columnId: SPECIFY_COLUMN.id },
        createdAt: "2026-11-10T12:00:00.000Z",
        ...overrides,
    };
}

describe("decideDrop", () => {
    it("starts a run when the card is dropped on a column with a trigger", () => {
        const action = decideDrop(buildCard(), SPECIFY_COLUMN, BOARD_TRIGGERS);

        expect(action).toEqual({ kind: "start_run", triggerId: "trg_specify" });
    });

    it("refuses a stage without a trigger, since the run moves the card there", () => {
        const action = decideDrop(buildCard(), DEVELOP_COLUMN, BOARD_TRIGGERS);

        expect(action).toEqual({
            kind: "not_allowed",
            reason: "Esta etapa é movida pela execução",
        });
    });

    it.each(["backlog", "needs_human", "done"] as const)(
        "sets the manual column when the card is dropped on %s",
        (column) => {
            const action = decideDrop(buildCard(), columnWithId(column), BOARD_TRIGGERS);

            expect(action).toEqual({ kind: "set_manual_column", column });
        },
    );

    it("refuses the Bloqueado column, which only the blockers of the item decide", () => {
        const action = decideDrop(buildCard(), columnWithId("blocked"), BOARD_TRIGGERS);

        expect(action.kind).toBe("not_allowed");
    });

    it("refuses to move a card whose item is running", () => {
        const runningCard = buildCard({ columnId: DEVELOP_COLUMN.id, status: "RUNNING" });

        const action = decideDrop(runningCard, columnWithId("done"), BOARD_TRIGGERS);

        expect(action).toEqual({ kind: "not_allowed", reason: "O item está em execução" });
    });

    it("moves a card whose last node run has finished", () => {
        const finishedCard = buildCard({ columnId: "needs_human", status: "FAILED" });

        const action = decideDrop(finishedCard, columnWithId("done"), BOARD_TRIGGERS);

        expect(action).toEqual({ kind: "set_manual_column", column: "done" });
    });

    it("refuses to start a run for a blocked item, naming its blockers", () => {
        const blockedCard = buildCard({ columnId: "blocked" });

        const action = decideDrop(blockedCard, SPECIFY_COLUMN, BOARD_TRIGGERS, ["#12", "#15"]);

        expect(action).toEqual({ kind: "not_allowed", reason: "Item bloqueado por #12, #15" });
    });
});

describe("listBoardColumnTriggers", () => {
    it("lists the column of each enabled board column trigger", () => {
        const triggers = [
            buildTrigger(),
            buildTrigger({ id: "trg_paused", enabled: false }),
            buildTrigger({ id: "trg_manual", config: { kind: "manual" } }),
        ];

        expect(listBoardColumnTriggers(triggers)).toEqual(BOARD_TRIGGERS);
    });
});
