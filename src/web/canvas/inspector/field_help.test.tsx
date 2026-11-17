import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import { FieldHelp } from "@/web/canvas/inspector/field_help.js";
import type { FieldDoc } from "@/web/docs/node_docs/node_doc.js";

const WORKSPACE_DOC: FieldDoc = {
    key: "workspace",
    label: "Workspace",
    description: "Se o agente trabalha com o código do item ou só com texto.",
    defaultValue: "Workspace do item",
    options: [
        { value: "item", label: "Workspace do item", description: "Uma cópia do código." },
        { value: "none", label: "Sem workspace", description: "Só pensa ou escreve texto." },
    ],
};

describe("FieldHelp", () => {
    it("shows the description, the default and the options when opened", async () => {
        render(<FieldHelp doc={WORKSPACE_DOC} />);

        await userEvent.click(screen.getByRole("button", { name: "Ajuda sobre Workspace" }));

        const help = screen.getByRole("dialog", { name: "Workspace" });
        expect(help).toHaveTextContent(WORKSPACE_DOC.description);
        expect(help).toHaveTextContent("Padrão: Workspace do item");
        expect(help).toHaveTextContent("Sem workspace — Só pensa ou escreve texto.");
    });

    it("stays closed until asked", () => {
        render(<FieldHelp doc={WORKSPACE_DOC} />);

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Ajuda sobre Workspace" })).toHaveAttribute(
            "aria-expanded",
            "false",
        );
    });

    it("opens with Enter and closes with Escape, returning the focus to the button", async () => {
        render(<FieldHelp doc={WORKSPACE_DOC} />);
        const helpButton = screen.getByRole("button", { name: "Ajuda sobre Workspace" });

        helpButton.focus();
        await userEvent.keyboard("{Enter}");
        expect(screen.getByRole("dialog", { name: "Workspace" })).toBeInTheDocument();

        await userEvent.keyboard("{Escape}");

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(helpButton).toHaveFocus();
    });

    it("leaves out the default and the options when the field has none", async () => {
        render(<FieldHelp doc={{ key: "prompt", label: "Prompt", description: "O que fazer." }} />);

        await userEvent.click(screen.getByRole("button", { name: "Ajuda sobre Prompt" }));

        expect(screen.getByRole("dialog", { name: "Prompt" })).not.toHaveTextContent("Padrão");
        expect(screen.queryByRole("list", { name: "Opções" })).not.toBeInTheDocument();
    });
});
