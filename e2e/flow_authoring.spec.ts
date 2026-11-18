import type { Locator, Page } from "@playwright/test";

import type { ScriptedOutputRule } from "@/integrations/agent_runtime/scripted_agent_outputs.js";

import { expect, RUN_TIMEOUT_MS, test } from "./fixtures.js";
import type { PortRef } from "./pages/flow_editor_page.js";
import { FlowEditorPage } from "./pages/flow_editor_page.js";

const FLOW_NAME = "Revisão até aprovar";
const DEV_PROMPT = "Implemente o item.";
const REVIEWER_PROMPT = "Revise as mudanças do Dev e diga se aprova.";
const REJECTED_REVIEW = { approved: false, notes: "Faltam testes." };
const APPROVED_REVIEW = { approved: true, notes: "Pode seguir." };
const MAX_REVIEW_ROUNDS = 3;
const NODES_OF_EACH_ITEM = [
    "Dev",
    "Reviewer",
    "Aprovado?",
    "Testes",
    "Git",
    "PR aberto?",
    "Concluído",
    "Precisa de humano",
];

interface ItemRun {
    projectId: string;
    itemId: string;
}

// The canvas draws the ports only from 50% of zoom; this screen fits the whole flow above that.
test.use({ viewport: { width: 2560, height: 1440 } });

test("builds the review flow in the editor and opens the PR once the Reviewer approves", async ({
    page,
    githubProject,
    forja,
}) => {
    test.slow();
    await forja.scriptAgentOutputs([reviewerVerdicts([REJECTED_REVIEW, APPROVED_REVIEW])]);
    await buildAndPublishReviewFlow(new FlowEditorPage(page), githubProject.id);

    await runFlowWithItem(page, { projectId: githubProject.id, itemId: githubProject.itemId });

    await expect(nodeStatus(page, { node: "Testes", status: "Sucesso" })).toBeVisible();
    await expect(await executionsOf(page, "Dev")).toHaveCount(2);
    await expect(await pullRequestOpenedByGit(page)).toHaveAttribute("href", /\/pull\/\d+$/);
    await expectItemInBoardColumn(page, { projectId: githubProject.id, column: "Concluído" });
});

test("sends the item to Precisa de humano when the Reviewer never approves", async ({
    page,
    githubProject,
    forja,
}) => {
    test.slow();
    await forja.scriptAgentOutputs([reviewerVerdicts([REJECTED_REVIEW])]);
    await buildAndPublishReviewFlow(new FlowEditorPage(page), githubProject.id);

    await runFlowWithItem(page, { projectId: githubProject.id, itemId: githubProject.itemId });

    await expect(nodeStatus(page, { node: "Testes", status: "Pulado" })).toBeVisible();
    await expect(await executionsOf(page, "Dev")).toHaveCount(MAX_REVIEW_ROUNDS);
    await expectItemInBoardColumn(page, {
        projectId: githubProject.id,
        column: "Precisa de humano",
    });
});

function reviewerVerdicts(outputs: unknown[]): ScriptedOutputRule {
    return { promptIncludes: REVIEWER_PROMPT, outputs };
}

// Fonte → Map[Loop[Dev ⇄ Reviewer] → Aprovado? → Testes → Git → PR aberto? → Concluído], and the
// Loop exhausted → Precisa de humano. Only agents take extra inputs in the editor, so the Decisões
// are what make Testes wait for the approval and Concluído wait for the PR.
async function buildAndPublishReviewFlow(editor: FlowEditorPage, projectId: string): Promise<void> {
    await editor.createBlankFlow(projectId, FLOW_NAME);
    await editor.startFromScratch();
    await addLocalSource(editor);
    await addDevAndReviewer(editor);
    await addTestsAfterApproval(editor);
    await addPullRequestAfterTests(editor);
    await addOutputs(editor);
    await groupItemStepsAndReviewRounds(editor);
    await connectReviewRounds(editor);
    await stopReviewRoundsOnApproval(editor);

    await editor.expectNoProblems();
    await editor.publishFirstVersion();
}

async function addLocalSource(editor: FlowEditorPage): Promise<void> {
    await addLinkedNode(editor, { from: { node: "Gatilho", port: "Itens" }, title: "Fonte" });
    await editor.chooseOption("Local");
    await editor.arrange();
}

async function addDevAndReviewer(editor: FlowEditorPage): Promise<void> {
    await editor.addFromPalette("Agente");
    await editor.rename("Dev");
    await editor.fillPrompt(DEV_PROMPT);
    await editor.arrange();

    await addLinkedNode(editor, {
        from: { node: "Dev", port: "Resumo em texto" },
        title: "Agente",
    });
    await editor.rename("Reviewer");
    await editor.fillPrompt(REVIEWER_PROMPT);
    await editor.expandSection("Formato da resposta");
    await editor.applyPreset("Aprovação");
    await editor.arrange();
}

async function addTestsAfterApproval(editor: FlowEditorPage): Promise<void> {
    await addLinkedNode(editor, {
        from: { node: "Reviewer", port: "Resultado" },
        title: "Decisão",
    });
    await editor.rename("Aprovado?");
    await editor.arrange();

    await addLinkedNode(editor, { from: { node: "Aprovado?", port: "Sim" }, title: "Comando" });
    await editor.rename("Testes");
    await editor.applyPreset("Rodar testes");
    await editor.arrange();
}

async function addPullRequestAfterTests(editor: FlowEditorPage): Promise<void> {
    await addLinkedNode(editor, { from: { node: "Testes", port: "Saída" }, title: "Git" });
    await editor.chooseOption("Abrir PR");
    await editor.openDataPicker("Texto do PR vem de");
    await editor.pickData("Texto do PR");
    await editor.arrange();

    await addLinkedNode(editor, { from: { node: "Git", port: "Resultado" }, title: "Decisão" });
    await editor.rename("PR aberto?");
    await editor.chooseDataFromList();
    await editor.pickData("Git › Resultado › prUrl");
    await editor.selectOption("Operador da regra 1", "não está vazio");
    await editor.arrange();
}

async function addOutputs(editor: FlowEditorPage): Promise<void> {
    await addLinkedNode(editor, { from: { node: "PR aberto?", port: "Sim" }, title: "Saída" });
    await editor.rename("Concluído");
    await editor.arrange();

    await editor.addFromPalette("Saída");
    await editor.rename("Precisa de humano");
    await editor.chooseOption("Precisa de humano");
    await editor.arrange();
}

async function groupItemStepsAndReviewRounds(editor: FlowEditorPage): Promise<void> {
    await editor.selectNodes(NODES_OF_EACH_ITEM);
    await editor.addFromPalette("Map");
    await editor.arrange();

    await editor.selectNodes(["Dev", "Reviewer"]);
    await editor.addFromPalette("Loop");
    await editor.arrange();
}

async function connectReviewRounds(editor: FlowEditorPage): Promise<void> {
    await editor.connect({ node: "Fonte", port: "Itens" }, { node: "Dev", port: "Item atual" });
    await editor.connect(
        { node: "Reviewer", port: "Resumo em texto" },
        { node: "Dev", port: "Contexto extra" },
    );
    await editor.connect(
        { node: "Loop", port: "Esgotou as voltas" },
        { node: "Precisa de humano", port: "Item atual" },
    );
    await editor.arrange();
}

async function stopReviewRoundsOnApproval(editor: FlowEditorPage): Promise<void> {
    await editor.openInspector("Loop");
    await editor.openDataPicker("Caminho da regra 1");
    await editor.pickData("Reviewer › Resultado › approved");
    await editor.selectOption("Operador da regra 1", "é verdadeiro");
}

async function addLinkedNode(
    editor: FlowEditorPage,
    { from, title }: { from: PortRef; title: string },
): Promise<void> {
    await editor.dropEdgeOnEmpty(from);
    await editor.chooseLinkedNode(title);
}

async function runFlowWithItem(page: Page, { projectId, itemId }: ItemRun): Promise<void> {
    await page.goto(`/projects/${projectId}/runs`);
    await page.getByRole("button", { name: "Nova run" }).click();
    await page.getByLabel("Itens").fill(itemId);
    await page.getByRole("button", { name: "Executar" }).click();

    await expect(page.getByRole("region", { name: "Controle da run" })).toContainText("Sucesso", {
        timeout: RUN_TIMEOUT_MS,
    });
}

async function executionsOf(page: Page, nodeLabel: string): Promise<Locator> {
    const drawer = await openNodeDrawer(page, nodeLabel);

    return drawer.getByRole("list", { name: "Execuções do nó" }).getByRole("listitem");
}

function nodeStatus(page: Page, { node, status }: { node: string; status: string }): Locator {
    return runCanvasNode(page, node).getByRole("img", { name: status });
}

async function pullRequestOpenedByGit(page: Page): Promise<Locator> {
    const drawer = await openNodeDrawer(page, "Git");
    await drawer.getByRole("list", { name: "Execuções do nó" }).getByRole("button").click();
    await drawer.getByRole("tab", { name: "Artefatos" }).click();

    return drawer.getByRole("list", { name: "Artefatos" }).getByRole("link");
}

async function expectItemInBoardColumn(
    page: Page,
    { projectId, column }: { projectId: string; column: string },
): Promise<void> {
    await page.goto(`/projects/${projectId}/board`);

    await expect(
        page.getByRole("region", { name: column, exact: true }).getByRole("article"),
    ).toHaveCount(1);
}

// A drawer left open covers the canvas, so Escape closes it before the next node is clicked.
async function openNodeDrawer(page: Page, nodeLabel: string): Promise<Locator> {
    await page.keyboard.press("Escape");
    await runCanvasNode(page, nodeLabel).click();

    return page.getByRole("dialog", { name: nodeLabel });
}

function runCanvasNode(page: Page, nodeLabel: string): Locator {
    return page.getByRole("application").getByRole("group", { name: nodeLabel, exact: true });
}
