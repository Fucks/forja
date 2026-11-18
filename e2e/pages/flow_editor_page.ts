import type { Locator, Page } from "@playwright/test";

import { expect } from "../fixtures.js";

/** A port of a canvas element, by the label of the element and the catalog label of the port. */
export interface PortRef {
    node: string;
    port: string;
}

interface Point {
    x: number;
    y: number;
}

const EMPTY_CANVAS_DISTANCE_PX = 160;
const POINTER_STEPS = 10;
const SETTLING_INTERVAL_MS = 250;

/** Builds a flow in the editor only through what a user sees: palette, ports and inspector. */
export class FlowEditorPage {
    private readonly palette: Locator;
    private readonly canvas: Locator;
    readonly inspector: Locator;

    constructor(private readonly page: Page) {
        this.palette = page.getByRole("complementary", { name: "Paleta" });
        this.canvas = page.getByRole("application");
        this.inspector = page.getByRole("complementary", { name: "Inspector" });
    }

    async createBlankFlow(projectId: string, name: string): Promise<void> {
        await this.page.goto(`/projects/${projectId}/flows`);
        await this.page.getByRole("button", { name: "Novo fluxo" }).click();
        await this.page.getByRole("radio", { name: /^Em branco/ }).check();
        await this.page.getByLabel("Nome").fill(name);
        await this.page.getByRole("button", { name: "Criar fluxo" }).click();

        await expect(this.page.getByRole("heading", { level: 1, name })).toBeVisible();
    }

    async startFromScratch(): Promise<void> {
        await expect(this.page.getByRole("heading", { name: "Por onde começar?" })).toBeVisible();
        await this.page.getByRole("button", { name: "Começar do zero" }).click();

        await expect(this.canvasElement("Gatilho")).toBeVisible();
    }

    /** Adds the element at the center of the canvas; it comes selected, with its inspector open. */
    async addFromPalette(title: string): Promise<void> {
        await this.palette.getByRole("button", { name: title, exact: true }).click();
    }

    async rename(label: string): Promise<void> {
        const labelField = this.inspector.getByRole("textbox", { name: "Rótulo" });
        await labelField.fill(label);
        await labelField.blur();

        await expect(this.canvasElement(label)).toBeVisible();
    }

    async arrange(): Promise<void> {
        const arrangeButton = this.canvas.getByRole("button", { name: "Organizar" });
        await arrangeButton.click();

        await expect(arrangeButton).toBeEnabled();
    }

    /** With nodes selected, the Map or Loop added from the palette wraps them. */
    async selectNodes(labels: string[]): Promise<void> {
        const [first, ...others] = labels;
        if (first === undefined) {
            return;
        }

        await this.canvasElement(first).click();
        for (const label of others) {
            await this.canvasElement(label).click({ modifiers: ["ControlOrMeta"] });
        }
    }

    async connect(from: PortRef, to: PortRef): Promise<void> {
        const start = await this.centerOf(this.portHandle(from, "Saída"));
        const end = await this.centerOf(this.portHandle(to, "Entrada"));

        await this.dragPointer(start, end);
    }

    /** Lets go of a connection on empty canvas, which offers the nodes that fit the port. */
    async dropEdgeOnEmpty(fromPort: PortRef): Promise<void> {
        const start = await this.centerOf(this.portHandle(fromPort, "Saída"));
        const emptyPoint = { x: start.x + EMPTY_CANVAS_DISTANCE_PX, y: start.y };

        await this.dragPointer(start, emptyPoint);
    }

    async chooseLinkedNode(title: string): Promise<void> {
        await this.page
            .getByRole("dialog", { name: "Adicionar nó ligado" })
            .getByRole("button", { name: title, exact: true })
            .click();
    }

    async openInspector(label: string): Promise<Locator> {
        await this.canvasElement(label).click();
        await expect(this.inspector.getByRole("textbox", { name: "Rótulo" })).toHaveValue(label);

        return this.inspector;
    }

    async fillPrompt(prompt: string): Promise<void> {
        await this.inspector.getByRole("textbox", { name: "Prompt" }).fill(prompt);
    }

    async expandSection(title: string): Promise<void> {
        await this.inspector.getByText(title, { exact: true }).filter({ visible: true }).click();
    }

    /** Opens the data picker of a field of the inspector. */
    async openDataPicker(fieldLabel: string): Promise<void> {
        await this.inspector.getByRole("button", { name: fieldLabel, exact: true }).click();
    }

    /** Turns a path typed by hand back into the list of known data. */
    async chooseDataFromList(): Promise<void> {
        await this.inspector.getByRole("button", { name: "Escolher da lista" }).click();
    }

    /** Picks, in the open data picker, the data whose label contains the given one. */
    async pickData(label: string): Promise<void> {
        await this.inspector
            .getByRole("tree", { name: "Dados disponíveis" })
            .getByRole("treeitem", { name: label })
            .click();
    }

    async chooseOption(title: string): Promise<void> {
        await this.inspector.getByRole("radio", { name: title }).click();
    }

    async selectOption(fieldLabel: string, option: string): Promise<void> {
        await this.inspector.getByRole("combobox", { name: fieldLabel }).click();
        await this.page.getByRole("option", { name: option, exact: true }).click();
    }

    async applyPreset(label: string): Promise<void> {
        await this.inspector.getByRole("button", { name: label, exact: true }).click();
    }

    async expectNoProblems(): Promise<void> {
        await expect(
            this.page.getByRole("heading", { name: "Problemas 0 erros · 0 avisos" }),
        ).toBeVisible();
    }

    async publishFirstVersion(): Promise<void> {
        await expect(this.page.getByRole("main").getByRole("status")).toHaveText("Salvo");
        await this.page.getByRole("button", { name: "Publicar v1" }).click();

        await expect(this.page.getByText("última versão publicada v1")).toBeVisible();
    }

    private canvasElement(label: string): Locator {
        return this.canvas.getByRole("group", { name: label, exact: true });
    }

    private portHandle({ node, port }: PortRef, side: "Entrada" | "Saída"): Locator {
        return this.canvasElement(node).getByLabel(`${side} ${port}`, { exact: true });
    }

    // "Organizar" and new nodes move the viewport, so the port is measured once it stops moving.
    private async centerOf(locator: Locator): Promise<Point> {
        let center = await this.measureCenter(locator);
        await expect(async () => {
            const previousCenter = center;
            center = await this.measureCenter(locator);
            expect(center).toEqual(previousCenter);
        }).toPass({ intervals: [SETTLING_INTERVAL_MS] });

        return center;
    }

    private async measureCenter(locator: Locator): Promise<Point> {
        const box = await locator.boundingBox();
        if (!box) {
            throw new Error(`${locator.toString()} is not on the screen`);
        }

        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }

    // React Flow connects on pointer events, so the drag is done with the mouse step by step.
    private async dragPointer(start: Point, end: Point): Promise<void> {
        await this.page.mouse.move(start.x, start.y);
        await this.page.mouse.down();
        await this.page.mouse.move(end.x, end.y, { steps: POINTER_STEPS });
        await this.page.mouse.up();
    }
}
