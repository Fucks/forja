import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";

import type { Project } from "@/shared/project_types.js";

import { buildProject } from "@/test/factories/project_factory.js";
import { respondWithApiError, stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
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

    it("creates a project, closes the dialog, refreshes the list and opens the overview", async () => {
        const user = userEvent.setup();
        const registeredProjects: Project[] = [];
        const fetchSpy = stubFetchRoutes({
            "GET /api/projects": () => Response.json(registeredProjects),
            "POST /api/projects": () => {
                registeredProjects.push(FORJA);
                return Response.json(FORJA, { status: 201 });
            },
            "GET /api/projects/prj_forja": () => Response.json(FORJA),
        });
        renderAppAt("/");

        await submitNewProject(user, { name: "Forja", repoPath: "/repos/forja" });

        expect(await screen.findByRole("heading", { level: 1, name: "Forja" })).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(fetchSpy).toHaveBeenCalledWith(
            "/api/projects",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ name: "Forja", repoPath: "/repos/forja" }),
            }),
        );
        await user.click(screen.getByRole("link", { name: "Projetos" }));
        expect(await screen.findByRole("row", { name: /Forja/ })).toBeInTheDocument();
    });

    it.each([
        { status: 422, message: "O caminho /tmp/solto não é um repositório git." },
        { status: 409, message: "O repositório /repos/forja já está cadastrado no projeto Forja." },
    ])(
        "shows the API error $status under the repository path field",
        async ({ status, message }) => {
            const user = userEvent.setup();
            stubFetchRoutes({
                "GET /api/projects": () => Response.json([]),
                "POST /api/projects": () => respondWithApiError(status, message),
            });
            renderAppAt("/");

            await submitNewProject(user, { name: "Solto", repoPath: "/tmp/solto" });

            const dialog = screen.getByRole("dialog", { name: "Novo projeto" });
            const repoPathField = within(dialog).getByLabelText("Caminho do repositório");
            await vi.waitFor(() =>
                expect(repoPathField).toHaveAccessibleDescription(expect.stringContaining(message)),
            );
            expect(repoPathField).toHaveAttribute("aria-invalid", "true");
        },
    );

    it("shows other API failures as a form alert", async () => {
        const user = userEvent.setup();
        stubFetchRoutes({
            "GET /api/projects": () => Response.json([]),
            "POST /api/projects": () => respondWithApiError(500, "Falha interna."),
        });
        renderAppAt("/");

        await submitNewProject(user, { name: "Forja", repoPath: "/repos/forja" });

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Não foi possível criar o projeto.",
        );
        expect(screen.getByLabelText("Caminho do repositório")).not.toHaveAttribute("aria-invalid");
    });
});

async function submitNewProject(
    user: UserEvent,
    input: { name: string; repoPath: string },
): Promise<void> {
    await user.click(await screen.findByRole("button", { name: "Novo projeto" }));
    const dialog = screen.getByRole("dialog", { name: "Novo projeto" });
    await user.type(within(dialog).getByLabelText("Nome"), input.name);
    await user.type(within(dialog).getByLabelText("Caminho do repositório"), input.repoPath);
    await user.click(within(dialog).getByRole("button", { name: "Criar projeto" }));
}

describe("ProjectPage", () => {
    it("shows the repository path, base branch and GitHub repository", async () => {
        stubFetchRoutes({ "GET /api/projects/prj_forja": () => Response.json(FORJA) });

        renderAppAt("/projects/prj_forja");

        expect(await screen.findByText("/repos/forja")).toBeInTheDocument();
        expect(screen.getByText("development")).toBeInTheDocument();
        expect(screen.getByText("Fucks/forja")).toBeInTheDocument();
    });

    it("marks what was detected and suggests the next step for what is missing", async () => {
        const project = buildProject({
            id: "prj_forja",
            detected: { codegraph: true, codingStandards: false, sandcastle: true },
        });
        stubFetchRoutes({ "GET /api/projects/prj_forja": () => Response.json(project) });

        renderAppAt("/projects/prj_forja");

        const detectedList = await screen.findByRole("list", { name: "Detectado" });
        expect(within(detectedList).getByText("CodeGraph")).toBeInTheDocument();
        expect(within(detectedList).getByText("Sandcastle")).toBeInTheDocument();
        expect(within(detectedList).queryByText("CODING_STANDARDS.md")).not.toBeInTheDocument();
        expect(screen.getByText(/Adicione um CODING_STANDARDS.md/)).toBeInTheDocument();
    });

    it("links to the flows, board and runs of the project", async () => {
        stubFetchRoutes({ "GET /api/projects/prj_forja": () => Response.json(FORJA) });

        renderAppAt("/projects/prj_forja");

        const shortcuts = await screen.findByRole("navigation", { name: "Atalhos do projeto" });
        expect(within(shortcuts).getByRole("link", { name: /Fluxos/ })).toHaveAttribute(
            "href",
            "/projects/prj_forja/flows",
        );
        expect(within(shortcuts).getByRole("link", { name: /Board/ })).toHaveAttribute(
            "href",
            "/projects/prj_forja/board",
        );
        expect(within(shortcuts).getByRole("link", { name: /Runs/ })).toHaveAttribute(
            "href",
            "/projects/prj_forja/runs",
        );
    });

    it("explains when the project cannot be loaded", async () => {
        stubFetchRoutes({});

        renderAppAt("/projects/prj_gone");

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Não foi possível carregar o projeto.",
        );
        expect(screen.getByRole("heading", { level: 1, name: "Projeto" })).toBeInTheDocument();
    });
});
