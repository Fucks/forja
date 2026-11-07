import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

import { APP_ROUTES } from "@/web/app/routes.js";

describe("AppShell", () => {
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
});

function renderAppAt(path: string): void {
    const router = createMemoryRouter(APP_ROUTES, { initialEntries: [path] });
    render(<RouterProvider router={router} />);
}
