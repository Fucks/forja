import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Plus } from "lucide-react";

import { Button } from "@/web/components/ui/button.js";
import { IconButton } from "@/web/components/ui/icon_button.js";

describe("Button", () => {
    it("calls onClick when clicked", async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(<Button onClick={onClick}>Salvar</Button>);

        await user.click(screen.getByRole("button", { name: "Salvar" }));

        expect(onClick).toHaveBeenCalledOnce();
    });

    it("calls onClick when activated with Enter and Space", async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(<Button onClick={onClick}>Salvar</Button>);

        await user.tab();
        await user.keyboard("{Enter}");
        await user.keyboard(" ");

        expect(screen.getByRole("button", { name: "Salvar" })).toHaveFocus();
        expect(onClick).toHaveBeenCalledTimes(2);
    });

    it("is disabled and announces aria-busy while loading", async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(
            <Button loading onClick={onClick}>
                Salvar
            </Button>,
        );

        const button = screen.getByRole("button", { name: "Salvar" });
        await user.click(button);

        expect(button).toBeDisabled();
        expect(button).toHaveAttribute("aria-busy", "true");
        expect(onClick).not.toHaveBeenCalled();
    });

    it("renders its child element instead of a button when asChild is set", () => {
        render(
            <Button asChild>
                <a href="/projetos">Projetos</a>
            </Button>,
        );

        expect(screen.getByRole("link", { name: "Projetos" })).toHaveAttribute("href", "/projetos");
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
});

describe("IconButton", () => {
    it("uses the label as accessible name and tooltip", async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(<IconButton label="Adicionar nó" icon={Plus} onClick={onClick} />);

        const button = screen.getByRole("button", { name: "Adicionar nó" });
        await user.click(button);

        expect(button).toHaveAttribute("aria-label", "Adicionar nó");
        expect(button).toHaveAttribute("title", "Adicionar nó");
        expect(onClick).toHaveBeenCalledOnce();
    });
});
