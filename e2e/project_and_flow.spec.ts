import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures.js";

const PROJECT_NAME = "Repo E2E";
const FLOW_NAME = "Fábrica E2E";
const DEVELOPER_NODE_LABEL = "Dev";
const DEVELOP_GROUP_LABEL = "Desenvolver";
const CONCURRENCY_OF_TWO_SUMMARY = "até 2 itens ao mesmo tempo";

test("registers the repository and publishes v1 of a flow made from the basic factory", async ({
    page,
    gitRepo,
}) => {
    await registerProject(page, gitRepo.path);
    await createFlowFromBasicFactory(page);

    await setDeveloperEffortToMax(page);
    await lowerDevelopGroupConcurrencyToTwo(page);
    await publishFirstVersion(page);

    await page.reload();
    const developerModelSection = await openModelSectionOfDeveloper(page);
    await expect(developerModelSection.getByRole("radio", { name: "max" })).toBeChecked();
    const developGroupInspector = await openInspectorOf(page, DEVELOP_GROUP_LABEL);
    await expect(developGroupInspector.getByText(CONCURRENCY_OF_TWO_SUMMARY)).toBeVisible();
});

async function registerProject(page: Page, repoPath: string): Promise<void> {
    await page.goto("/");
    await page.getByRole("button", { name: "Novo projeto" }).click();
    await page.getByLabel("Nome").fill(PROJECT_NAME);
    await page.getByLabel("Caminho do repositório").fill(repoPath);
    await page.getByRole("button", { name: "Criar projeto" }).click();

    await expect(page.getByRole("heading", { level: 1, name: PROJECT_NAME })).toBeVisible();
}

async function createFlowFromBasicFactory(page: Page): Promise<void> {
    await page.getByRole("link", { name: "Fluxos", exact: true }).click();
    await page.getByRole("button", { name: "Novo fluxo" }).click();
    await page.getByLabel("Fábrica básica").check();
    await page.getByLabel("Nome").fill(FLOW_NAME);
    await page.getByRole("button", { name: "Criar fluxo" }).click();

    await expect(page.getByRole("heading", { level: 1, name: FLOW_NAME })).toBeVisible();
}

async function setDeveloperEffortToMax(page: Page): Promise<void> {
    const modelSection = await openModelSectionOfDeveloper(page);
    await modelSection.getByRole("radio", { name: "max" }).click();
}

async function openModelSectionOfDeveloper(page: Page): Promise<Locator> {
    const inspector = await openInspectorOf(page, DEVELOPER_NODE_LABEL);
    await inspector.getByText("Modelo e esforço").click();

    return inspector;
}

async function lowerDevelopGroupConcurrencyToTwo(page: Page): Promise<void> {
    const inspector = await openInspectorOf(page, DEVELOP_GROUP_LABEL);
    await inspector.getByRole("slider", { name: "Itens em paralelo" }).focus();
    await page.keyboard.press("ArrowLeft");

    await expect(inspector.getByText(CONCURRENCY_OF_TWO_SUMMARY)).toBeVisible();
}

async function publishFirstVersion(page: Page): Promise<void> {
    await expect(page.getByRole("main").getByRole("status")).toHaveText("Salvo");
    await page.getByRole("button", { name: "Publicar v1" }).click();

    await expect(page.getByText("última versão publicada v1")).toBeVisible();
}

async function openInspectorOf(page: Page, canvasElementLabel: string): Promise<Locator> {
    await page.getByRole("group", { name: canvasElementLabel, exact: true }).click();
    const inspector = page.getByRole("complementary", { name: "Inspector" });
    await expect(inspector.getByRole("textbox", { name: "Rótulo" })).toHaveValue(
        canvasElementLabel,
    );

    return inspector;
}
