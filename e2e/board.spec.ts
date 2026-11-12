import type { Locator, Page } from "@playwright/test";

import { createLocalItemOnBoard } from "./board_steps.js";
import { expect, RUN_TIMEOUT_MS, test } from "./fixtures.js";

const ITEM_TITLE = "Pix expira junto com o pedido";
const SPECIFY_COLUMN_ID = "stage:specify";

test("runs a new item dropped on the trigger column until its card reaches Concluído", async ({
    page,
    runnableProject,
    forja,
}) => {
    await forja.createBoardColumnTrigger(runnableProject.id, {
        flowId: runnableProject.flowId,
        columnId: SPECIFY_COLUMN_ID,
    });
    await page.goto(`/projects/${runnableProject.id}/board`);
    await createLocalItemOnBoard(page, ITEM_TITLE);
    await runnableProject.prepareItemsToRun();

    await dragCardByKeyboard(page, {
        title: ITEM_TITLE,
        from: "Backlog",
        passingThrough: ["Bloqueado"],
        to: "Especificar",
    });
    await page.getByRole("button", { name: "Iniciar run" }).click();

    await expect(cardIn(boardColumn(page, "Especificar"), ITEM_TITLE)).toBeVisible();
    await expect(cardIn(boardColumn(page, "Desenvolver"), ITEM_TITLE)).toBeVisible();
    await expect(cardIn(boardColumn(page, "Concluído"), ITEM_TITLE)).toBeVisible({
        timeout: RUN_TIMEOUT_MS,
    });
});

interface KeyboardDrag {
    title: string;
    from: string;
    passingThrough: string[];
    to: string;
}

// Each arrow moves the card one column; the next arrow waits for the board to announce the move.
async function dragCardByKeyboard(
    page: Page,
    { title, from, passingThrough, to }: KeyboardDrag,
): Promise<void> {
    const expectCardOver = (column: string): Promise<void> =>
        expect(page.getByRole("main").getByRole("status")).toHaveText(`${title} sobre ${column}.`);

    await page.getByRole("button", { name: `Mover ${title}` }).focus();
    await page.keyboard.press("Space");
    await expectCardOver(from);
    for (const column of [...passingThrough, to]) {
        await page.keyboard.press("ArrowRight");
        await expectCardOver(column);
    }
    await page.keyboard.press("Space");
}

function boardColumn(page: Page, label: string): Locator {
    return page.getByRole("region", { name: label, exact: true });
}

function cardIn(column: Locator, title: string): Locator {
    return column.getByRole("article", { name: title });
}
