import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.js";
import { GATE_MESSAGE, localGateFlow } from "./flow_graphs.js";

const ITEM_TITLE = "Histórico de pedidos do cliente";
const APPROVAL_COMMENT = "Conferi o item, pode seguir.";

test.use({ projectFlow: localGateFlow() });

test("approves the gate with a comment and the flow goes on to the end", async ({
    page,
    runnableProject,
    forja,
}) => {
    await forja.createLocalItem(runnableProject.id, ITEM_TITLE);
    const itemIds = await runnableProject.prepareItemsToRun();
    const runId = await forja.startRun(runnableProject.id, {
        flowId: runnableProject.flowId,
        itemIds,
    });

    await approveWithComment(page, { projectId: runnableProject.id, comment: APPROVAL_COMMENT });

    const decision = page.getByRole("region", { name: "Decisão" });
    await expect(decision).toContainText("Resolvido em");
    await expect(decision.getByText(APPROVAL_COMMENT)).toBeVisible();
    await page.goto(`/projects/${runnableProject.id}/runs/${runId}`);
    await expect(page.getByRole("region", { name: "Controle da run" })).toContainText("Sucesso");
    await expect(
        page
            .getByRole("group", { name: "Saída", exact: true })
            .getByRole("img", { name: "Sucesso" }),
    ).toBeVisible();
});

async function approveWithComment(
    page: Page,
    { projectId, comment }: { projectId: string; comment: string },
): Promise<void> {
    await page.goto(`/projects/${projectId}/approvals`);
    await page
        .getByRole("navigation", { name: "Pedidos de aprovação" })
        .getByText(GATE_MESSAGE)
        .click();
    await page.getByLabel("Comentário").fill(comment);
    await page.getByRole("button", { name: "Aprovar" }).click();
}
