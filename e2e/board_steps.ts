import type { Page } from "@playwright/test";

import { expect } from "./fixtures.js";

export async function createLocalItemOnBoard(page: Page, title: string): Promise<void> {
    await page.getByRole("button", { name: "Novo item" }).click();
    await page.getByLabel("Título").fill(title);
    await page.getByRole("button", { name: "Criar item" }).click();

    await expect(page.getByRole("article", { name: title })).toBeVisible();
}
