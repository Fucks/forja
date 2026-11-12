import type { Locator, Page } from "@playwright/test";

import { createLocalItemOnBoard } from "./board_steps.js";
import { expect, RUN_TIMEOUT_MS, test } from "./fixtures.js";

const ITEM_TITLES = ["Cardápio em centavos", "Taxa de entrega", "Pausar a loja"];

test("follows a run live, from the running Dev node to its logs and the success", async ({
    page,
    runnableProject,
}) => {
    await page.goto(`/projects/${runnableProject.id}/board`);
    for (const title of ITEM_TITLES) {
        await createLocalItemOnBoard(page, title);
    }
    const itemIds = await runnableProject.prepareItemsToRun();

    await startRunOfDefaultFlow(page, { projectId: runnableProject.id, itemIds });

    await expect(canvasNode(page, "Dev").getByRole("img", { name: "Rodando" })).toBeVisible();
    await expect(canvasNode(page, "Desenvolver")).toContainText(/\d+ rodando/);
    const logs = await openLogsOfRunningExecution(page, "Dev");
    await expect(logs.getByRole("listitem").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("region", { name: "Controle da run" })).toContainText("Sucesso", {
        timeout: RUN_TIMEOUT_MS,
    });
});

async function startRunOfDefaultFlow(
    page: Page,
    { projectId, itemIds }: { projectId: string; itemIds: string[] },
): Promise<void> {
    await page.goto(`/projects/${projectId}/runs`);
    await page.getByRole("button", { name: "Nova run" }).click();
    await page.getByLabel("Itens").fill(itemIds.join(" "));
    await page.getByRole("button", { name: "Executar" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Run" })).toBeVisible();
}

function canvasNode(page: Page, label: string): Locator {
    return page.getByRole("group", { name: label, exact: true });
}

async function openLogsOfRunningExecution(page: Page, nodeLabel: string): Promise<Locator> {
    await canvasNode(page, nodeLabel).click();
    const drawer = page.getByRole("dialog", { name: nodeLabel });
    await drawer
        .getByRole("list", { name: "Execuções do nó" })
        .getByRole("button", { name: /^Rodando/ })
        .first()
        .click();
    await drawer.getByRole("tab", { name: "Logs" }).click();

    return drawer.getByRole("log", { name: "Logs" });
}
