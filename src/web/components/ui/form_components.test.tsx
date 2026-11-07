import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Plus } from "lucide-react";
import { createRef } from "react";

import { Button } from "@/web/components/ui/button.js";
import { Field } from "@/web/components/ui/field.js";
import { IconButton } from "@/web/components/ui/icon_button.js";
import { Input } from "@/web/components/ui/input.js";
import { Textarea } from "@/web/components/ui/textarea.js";

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

describe("Field", () => {
    it("labels the control and links the hint and the error with aria-describedby", () => {
        render(
            <Field
                label="Nome"
                hint="Aparece na barra lateral."
                error="Informe um nome."
                htmlFor="project-name"
            >
                <Input />
            </Field>,
        );

        const input = screen.getByRole("textbox", { name: "Nome" });

        expect(input).toHaveAttribute("id", "project-name");
        expect(input).toHaveAccessibleDescription("Aparece na barra lateral. Informe um nome.");
        expect(input).toHaveAttribute("aria-invalid", "true");
    });

    it("keeps the control valid when there is no error", () => {
        render(
            <Field label="Nome" hint="Aparece na barra lateral." htmlFor="project-name">
                <Input />
            </Field>,
        );

        const input = screen.getByRole("textbox", { name: "Nome" });

        expect(input).toHaveAccessibleDescription("Aparece na barra lateral.");
        expect(input).not.toHaveAttribute("aria-invalid");
    });
});

describe("Input", () => {
    it("forwards the ref to the input so React Hook Form can register it", async () => {
        const user = userEvent.setup();
        const ref = createRef<HTMLInputElement>();
        render(<Input ref={ref} aria-label="Comando" mono />);

        await user.type(screen.getByRole("textbox", { name: "Comando" }), "npm test");

        expect(ref.current).toBeInstanceOf(HTMLInputElement);
        expect(ref.current?.value).toBe("npm test");
    });

    it("marks itself as invalid with aria-invalid", () => {
        render(<Input aria-label="Comando" invalid />);

        expect(screen.getByRole("textbox", { name: "Comando" })).toHaveAttribute(
            "aria-invalid",
            "true",
        );
    });
});

describe("Textarea", () => {
    it("forwards the ref and marks itself as invalid", async () => {
        const user = userEvent.setup();
        const ref = createRef<HTMLTextAreaElement>();
        render(<Textarea ref={ref} aria-label="Descrição" invalid />);

        await user.type(screen.getByRole("textbox", { name: "Descrição" }), "Revisa o PR");

        expect(ref.current?.value).toBe("Revisa o PR");
        expect(ref.current).toHaveAttribute("aria-invalid", "true");
    });
});
