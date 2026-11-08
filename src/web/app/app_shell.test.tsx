import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router";

import { stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import { createFakeMatchMedia } from "@/test/fakes/fake_match_media.js";
import { renderAppAt } from "@/test/render_app_at.js";
import { Topbar } from "@/web/app/topbar.js";
import { THEME_STORAGE_KEY } from "@/web/styles/theme.js";

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
    beforeEach(() => {
        stubFetchRoutes({ "GET /api/projects": () => Response.json([]) });
    });

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

    it("collapses the sidebar to icons that keep their accessible names", async () => {
        const user = userEvent.setup();
        renderAppAt("/projects/forja/runs");

        await user.click(screen.getByRole("button", { name: "Recolher barra lateral" }));

        expect(screen.getByRole("button", { name: "Expandir barra lateral" })).toHaveAttribute(
            "aria-expanded",
            "false",
        );
        expect(screen.getByRole("link", { name: "Runs" })).toHaveAttribute("aria-current", "page");
        expect(screen.queryByText("Runs", { selector: "a span" })).not.toBeInTheDocument();
    });

    it("shows the item name in a tooltip when a collapsed sidebar link gets focus", async () => {
        const user = userEvent.setup();
        renderAppAt("/projects/forja/runs");
        await user.click(screen.getByRole("button", { name: "Recolher barra lateral" }));

        screen.getByRole("link", { name: "Gatilhos" }).focus();

        expect(await screen.findByRole("tooltip", { name: "Gatilhos" })).toBeInTheDocument();
    });

    it("expands the collapsed sidebar again", async () => {
        const user = userEvent.setup();
        renderAppAt("/projects/forja/runs");
        await user.click(screen.getByRole("button", { name: "Recolher barra lateral" }));

        await user.click(screen.getByRole("button", { name: "Expandir barra lateral" }));

        expect(screen.getByText("Runs", { selector: "a span" })).toBeVisible();
    });

    it("keeps the sidebar collapsed on viewports narrower than 1024 px", () => {
        vi.spyOn(window, "matchMedia").mockImplementation(
            createFakeMatchMedia(["(max-width: 1023px)"]),
        );

        renderAppAt("/projects/forja/runs");

        expect(screen.getByRole("link", { name: "Runs" })).toBeInTheDocument();
        expect(screen.queryByText("Runs", { selector: "a span" })).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Expandir barra lateral" }),
        ).not.toBeInTheDocument();
    });

    it("shows the active project in the topbar", () => {
        renderAppAt("/projects/forja/board");

        expect(
            within(screen.getByRole("banner")).getByRole("link", { name: "forja" }),
        ).toHaveAttribute("href", "/projects/forja");
    });
});

describe("Topbar", () => {
    beforeEach(() => {
        localStorage.clear();
        delete document.documentElement.dataset.theme;
    });

    it("shows that the live connection is on", () => {
        renderTopbar({ projectId: "forja", connected: true });

        expect(screen.getByText("Ao vivo")).toBeInTheDocument();
    });

    it("shows that the live connection is off", () => {
        renderTopbar({ projectId: "forja", connected: false });

        expect(screen.getByText("Desconectado")).toBeInTheDocument();
    });

    it("switches to the light theme and remembers it", async () => {
        const user = userEvent.setup();
        renderTopbar({ projectId: undefined, connected: false });

        await user.click(screen.getByRole("button", { name: "Usar tema claro" }));

        expect(document.documentElement.dataset.theme).toBe("light");
        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
        expect(screen.getByRole("button", { name: "Usar tema escuro" })).toBeInTheDocument();
    });

    it("starts from the stored theme", () => {
        localStorage.setItem(THEME_STORAGE_KEY, "light");

        renderTopbar({ projectId: undefined, connected: false });

        expect(screen.getByRole("button", { name: "Usar tema escuro" })).toBeInTheDocument();
    });
});

function renderTopbar(props: ComponentProps<typeof Topbar>): void {
    render(
        <MemoryRouter>
            <Topbar {...props} />
        </MemoryRouter>,
    );
}
