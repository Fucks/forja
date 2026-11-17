import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import { OptionCards } from "@/web/canvas/inspector/option_cards.js";

type Workspace = "item" | "none" | "shared";

const WORKSPACE_OPTIONS: { value: Workspace; label: string; description: string }[] = [
    { value: "item", label: "Workspace do item", description: "Uma cópia do código." },
    { value: "none", label: "Sem workspace", description: "Só pensa ou escreve texto." },
    { value: "shared", label: "Compartilhado", description: "O mesmo código para todos." },
];

describe("OptionCards", () => {
    it("is a radio group whose cards show the title and the description", () => {
        renderWorkspaceCards("item");

        const group = screen.getByRole("radiogroup", { name: "Workspace" });
        const selectedCard = screen.getByRole("radio", { name: /Workspace do item/ });
        expect(group).toContainElement(selectedCard);
        expect(selectedCard).toHaveAttribute("aria-checked", "true");
        expect(selectedCard).toHaveTextContent("Uma cópia do código.");
        expect(screen.getByRole("radio", { name: /Sem workspace/ })).toHaveAttribute(
            "aria-checked",
            "false",
        );
    });

    it("reports the clicked option", async () => {
        const onChange = renderWorkspaceCards("item");

        await userEvent.click(screen.getByRole("radio", { name: /Sem workspace/ }));

        expect(onChange).toHaveBeenCalledWith("none");
    });

    it("lets only the selected card be reached with Tab", () => {
        renderWorkspaceCards("none");

        const tabStops = screen
            .getAllByRole("radio")
            .filter((card) => card.getAttribute("tabindex") === "0");
        expect(tabStops).toEqual([screen.getByRole("radio", { name: /Sem workspace/ })]);
    });

    it("selects the next option with the arrow keys, wrapping around the ends", async () => {
        const onChange = renderWorkspaceCards("shared");

        screen.getByRole("radio", { name: /Compartilhado/ }).focus();
        await userEvent.keyboard("{ArrowDown}");

        expect(onChange).toHaveBeenLastCalledWith("item");
        expect(screen.getByRole("radio", { name: /Workspace do item/ })).toHaveFocus();
    });

    it("selects the previous option with the up arrow", async () => {
        const onChange = renderWorkspaceCards("item");

        screen.getByRole("radio", { name: /Workspace do item/ }).focus();
        await userEvent.keyboard("{ArrowUp}");

        expect(onChange).toHaveBeenLastCalledWith("shared");
    });
});

function renderWorkspaceCards(value: Workspace): (value: Workspace) => void {
    const onChange = vi.fn<(value: Workspace) => void>();
    render(
        <OptionCards
            label="Workspace"
            value={value}
            options={WORKSPACE_OPTIONS}
            onChange={onChange}
        />,
    );

    return onChange;
}
