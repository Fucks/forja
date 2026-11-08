import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import { buildProject } from "@/test/factories/project_factory.js";
import { stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import { renderAppAt } from "@/test/render_app_at.js";

const FORJA = buildProject({
    id: "prj_forja",
    name: "Forja",
    repoPath: "/repos/forja",
    githubRepo: "Fucks/forja",
    baseBranch: "development",
});

describe("ProjectsPage", () => {
    it("offers to create the first project when there are none", async () => {
        stubFetchRoutes({ "GET /api/projects": () => Response.json([]) });

        renderAppAt("/");

        expect(
            await screen.findByRole("heading", { name: "Nenhum projeto ainda" }),
        ).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Novo projeto" })).toBeInTheDocument();
    });

    it("lists the projects with path, GitHub repository and base branch", async () => {
        stubFetchRoutes({ "GET /api/projects": () => Response.json([FORJA]) });

        renderAppAt("/");

        const row = await screen.findByRole("row", { name: /Forja/ });
        expect(within(row).getByText("/repos/forja")).toBeInTheDocument();
        expect(within(row).getByText("Fucks/forja")).toBeInTheDocument();
        expect(within(row).getByText("development")).toBeInTheDocument();
    });

    it("opens the project overview from the list", async () => {
        const user = userEvent.setup();
        stubFetchRoutes({
            "GET /api/projects": () => Response.json([FORJA]),
            "GET /api/projects/prj_forja": () => Response.json(FORJA),
        });
        renderAppAt("/");

        await user.click(await screen.findByRole("link", { name: "Forja" }));

        expect(await screen.findByRole("heading", { level: 1, name: "Forja" })).toBeInTheDocument();
    });
});
