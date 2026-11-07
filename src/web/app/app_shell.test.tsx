import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

import { APP_ROUTES } from "@/web/app/routes.js";

const ROUTE_TITLES = [
    { path: "/", title: "Projetos" },
    { path: "/projects/forja", title: "Projeto" },
    { path: "/projects/forja/settings", title: "Configurações do projeto" },
    { path: "/projects/forja/flows", title: "Fluxos" },
    { path: "/projects/forja/flows/review", title: "Editor de fluxo" },
    { path: "/projects/forja/flows/review/versions", title: "Versões do fluxo" },
    { path: "/projects/forja/board", title: "Board" },
    { path: "/projects/forja/runs", title: "Runs" },
    { path: "/projects/forja/runs/run-1", title: "Run" },
    { path: "/projects/forja/usage", title: "Uso" },
    { path: "/projects/forja/triggers", title: "Gatilhos" },
    { path: "/projects/forja/approvals", title: "Aprovações" },
    { path: "/settings/credentials", title: "Credenciais" },
    { path: "/settings/tool-profiles", title: "Perfis de ferramentas" },
    { path: "/settings/diagnostics", title: "Diagnóstico" },
    { path: "/styleguide", title: "Styleguide" },
];

describe("AppShell", () => {
    it.each(ROUTE_TITLES)("renders $path inside the shell", ({ path, title }) => {
        renderAppAt(path);

        expect(screen.getByRole("navigation", { name: "Navegação principal" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    });

    it("marks only the projects link as current on the home page", () => {
        renderAppAt("/");

        expect(screen.getByRole("link", { name: "Projetos" })).toHaveAttribute(
            "aria-current",
            "page",
        );
        expect(screen.getByRole("link", { name: "Credenciais" })).not.toHaveAttribute(
            "aria-current",
        );
    });

    it("keeps the flows area current inside a flow editor", () => {
        renderAppAt("/projects/forja/flows/review");

        expect(screen.getByRole("link", { name: "Fluxos" })).toHaveAttribute(
            "aria-current",
            "page",
        );
        expect(screen.getByRole("link", { name: "Projetos" })).not.toHaveAttribute("aria-current");
    });

    it("hides the project areas outside a project", () => {
        renderAppAt("/settings/credentials");

        expect(screen.queryByRole("link", { name: "Fluxos" })).not.toBeInTheDocument();
    });

    it("renders a project route inside the shell with its area marked as current", () => {
        renderAppAt("/projects/forja/runs");

        const navigation = screen.getByRole("navigation", { name: "Navegação principal" });
        expect(within(navigation).getByRole("link", { name: "Runs" })).toHaveAttribute(
            "aria-current",
            "page",
        );
        expect(within(navigation).getByRole("link", { name: "Fluxos" })).not.toHaveAttribute(
            "aria-current",
        );
        expect(screen.getByRole("heading", { level: 1, name: "Runs" })).toBeInTheDocument();
    });

    it("shows the not found page inside the shell for an unknown route", () => {
        renderAppAt("/nowhere/at/all");

        expect(screen.getByRole("navigation", { name: "Navegação principal" })).toBeInTheDocument();
        expect(
            screen.getByRole("heading", { level: 1, name: "Página não encontrada" }),
        ).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Voltar para os projetos" })).toHaveAttribute(
            "href",
            "/",
        );
    });
});

function renderAppAt(path: string): void {
    const router = createMemoryRouter(APP_ROUTES, { initialEntries: [path] });
    render(<RouterProvider router={router} />);
}
