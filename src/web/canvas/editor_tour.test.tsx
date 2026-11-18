import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import { EditorTour } from "@/web/canvas/editor_tour.js";
import { EDITOR_TOUR_DISMISSED_KEY } from "@/web/canvas/editor_tour_storage.js";

const STEP_TITLES = ["Paleta", "Nós", "Portas", "Inspector", "Publicar"];

describe("EditorTour", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("opens on the first step, the palette, with its position in the tour", () => {
        render(<EditorTour />);

        const tour = screen.getByRole("dialog", { name: "Paleta" });
        expect(tour).toHaveTextContent("1 de 5");
    });

    it("keeps the focus inside the tour", () => {
        render(<EditorTour />);

        expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    });

    it("walks through the palette, the node, the port, the inspector and publishing", async () => {
        render(<EditorTour />);
        const visitedTitles = [screen.getByRole("heading").textContent];

        for (let step = 2; step <= STEP_TITLES.length; step++) {
            await userEvent.click(screen.getByRole("button", { name: "Próximo" }));
            visitedTitles.push(screen.getByRole("heading").textContent);
            expect(screen.getByRole("dialog")).toHaveTextContent(`${step} de 5`);
        }

        expect(visitedTitles).toEqual(STEP_TITLES);
    });

    it("goes back to the previous step", async () => {
        render(<EditorTour />);
        await userEvent.click(screen.getByRole("button", { name: "Próximo" }));

        await userEvent.click(screen.getByRole("button", { name: "Voltar" }));

        expect(screen.getByRole("dialog", { name: "Paleta" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Voltar" })).toBeNull();
    });

    it("finishes on the last step and does not open again", async () => {
        const { unmount } = render(<EditorTour />);
        await walkToLastStep();
        expect(screen.queryByRole("button", { name: "Próximo" })).toBeNull();

        await userEvent.click(screen.getByRole("button", { name: "Concluir" }));
        expect(screen.queryByRole("dialog")).toBeNull();
        unmount();
        render(<EditorTour />);

        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("closes when skipped and opens again next time", async () => {
        const { unmount } = render(<EditorTour />);

        await userEvent.click(screen.getByRole("button", { name: "Pular" }));
        expect(screen.queryByRole("dialog")).toBeNull();
        unmount();
        render(<EditorTour />);

        expect(screen.getByRole("dialog", { name: "Paleta" })).toBeInTheDocument();
    });

    it("skips the tour with Escape", async () => {
        render(<EditorTour />);

        await userEvent.keyboard("{Escape}");

        expect(screen.queryByRole("dialog")).toBeNull();
        expect(localStorage.getItem(EDITOR_TOUR_DISMISSED_KEY)).toBeNull();
    });

    it("does not open again after Não mostrar de novo", async () => {
        const { unmount } = render(<EditorTour />);

        await userEvent.click(screen.getByRole("button", { name: "Não mostrar de novo" }));
        expect(screen.queryByRole("dialog")).toBeNull();
        unmount();
        render(<EditorTour />);

        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("still opens and closes when the storage is unavailable", async () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(throwStorageError);
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(throwStorageError);
        render(<EditorTour />);
        expect(screen.getByRole("dialog", { name: "Paleta" })).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Não mostrar de novo" }));

        expect(screen.queryByRole("dialog")).toBeNull();
    });
});

async function walkToLastStep(): Promise<void> {
    for (let step = 1; step < STEP_TITLES.length; step++) {
        await userEvent.click(screen.getByRole("button", { name: "Próximo" }));
    }
}

function throwStorageError(): never {
    throw new DOMException("O armazenamento está bloqueado.", "SecurityError");
}
