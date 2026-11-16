import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import type { JSX } from "react";
import { MemoryRouter } from "react-router";

import { NodeDocDrawer } from "@/web/docs/node_doc_drawer.js";

function DrawerOpener(): JSX.Element {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <MemoryRouter>
            <button type="button" onClick={() => setIsOpen(true)}>
                Ajuda da Decisão
            </button>
            <NodeDocDrawer type="condition" open={isOpen} onOpenChange={setIsOpen} />
        </MemoryRouter>
    );
}

describe("NodeDocDrawer", () => {
    it("opens with the keyboard and shows the node documentation", async () => {
        const user = userEvent.setup();
        render(<DrawerOpener />);

        await user.tab();
        await user.keyboard("{Enter}");

        const drawer = screen.getByRole("dialog", { name: "Documentação do nó" });
        expect(within(drawer).getByRole("heading", { name: "Decisão" })).toBeInTheDocument();
    });

    it("closes with Esc", async () => {
        const user = userEvent.setup();
        render(<DrawerOpener />);
        await user.click(screen.getByRole("button", { name: "Ajuda da Decisão" }));

        await user.keyboard("{Escape}");

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
});
