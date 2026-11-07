import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import type { JSX } from "react";

import { Dialog } from "@/web/components/ui/dialog.js";
import { StatusBadge } from "@/web/components/ui/status_badge.js";

describe("StatusBadge", () => {
    it("shows the status label next to its icon", () => {
        render(<StatusBadge status="SUCCEEDED" />);

        const label = screen.getByText("Sucesso");
        expect(label).toBeVisible();
        expect(label.parentElement?.querySelector("svg")).toBeInTheDocument();
    });

    it("moves the label to aria-label when the label is hidden", () => {
        render(<StatusBadge status="WAITING_APPROVAL" showLabel={false} />);

        expect(screen.getByRole("img", { name: "Aguardando aprovação" })).toBeInTheDocument();
        expect(screen.queryByText("Aguardando aprovação")).not.toBeInTheDocument();
    });

    it("animates the running status", () => {
        render(<StatusBadge status="RUNNING" />);

        expect(screen.getByText("Rodando").parentElement).toHaveClass("animate-ember");
    });
});

describe("Dialog", () => {
    it("keeps the focus inside while it is open", async () => {
        const user = userEvent.setup();
        render(<DialogHarness />);
        await user.click(screen.getByRole("button", { name: "Abrir" }));

        await user.tab();
        await user.tab();
        await user.tab();

        const dialog = screen.getByRole("dialog", { name: "Excluir fluxo" });
        expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it("closes with Esc", async () => {
        const user = userEvent.setup();
        render(<DialogHarness />);
        await user.click(screen.getByRole("button", { name: "Abrir" }));

        await user.keyboard("{Escape}");

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
});

function DialogHarness(): JSX.Element {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button onClick={() => setIsOpen(true)}>Abrir</button>
            <Dialog open={isOpen} onOpenChange={setIsOpen} title="Excluir fluxo">
                <input aria-label="Confirmação" />
            </Dialog>
        </>
    );
}
