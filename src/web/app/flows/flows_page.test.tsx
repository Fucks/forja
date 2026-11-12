import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import type { FlowSummary, FlowTemplateSummary } from "@/shared/flow_types.js";
import { listSentWrites, respondWithApiError, stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import type { FakeRoutes } from "@/test/fakes/fake_fetch.js";
import { renderAppAt } from "@/test/render_app_at.js";

const PROJECT_ID = "prj_forja";
const FLOWS_PAGE_PATH = `/projects/${PROJECT_ID}/flows`;
const FLOWS_URL = `/api/projects/${PROJECT_ID}/flows`;
const LIST_FLOWS_URL = `${FLOWS_URL}?includeArchived=true`;
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const HTTP_UNPROCESSABLE_ENTITY = 422;
const BROKEN_YAML_MESSAGE = "O YAML é inválido na linha 3, coluna 1.";

const TEMPLATES: FlowTemplateSummary[] = [
    { id: "basic-factory", name: "Fábrica básica", description: "TL → Dev ×3 → Reviewer → PR" },
    { id: "review-loop", name: "Dev ↔ Review em loop", description: "Dev e Review até aprovar" },
];

function buildFlowSummary(overrides: Partial<FlowSummary> & { id: string }): FlowSummary {
    return {
        projectId: PROJECT_ID,
        name: "Fluxo",
        isDefault: false,
        archived: false,
        draftUpdatedAt: "2026-11-10T12:00:00Z",
        draftRevision: 1,
        ...overrides,
    };
}

const ISSUES_TO_PR = buildFlowSummary({
    id: "flw_issues",
    name: "Issues para PR",
    isDefault: true,
    latestVersion: 3,
});
const HOTFIX = buildFlowSummary({ id: "flw_hotfix", name: "Hotfix" });
const LEGACY = buildFlowSummary({ id: "flw_legacy", name: "Legado", archived: true });

function fakeFlowsApi(flows: FlowSummary[], extraRoutes: FakeRoutes = {}): FakeRoutes {
    return {
        [`GET ${LIST_FLOWS_URL}`]: () => Response.json(flows),
        "GET /api/flow-templates": () => Response.json(TEMPLATES),
        ...extraRoutes,
    };
}

describe("FlowsPage", () => {
    it("offers to create or import the first flow when there are none", async () => {
        stubFetchRoutes(fakeFlowsApi([]));

        renderAppAt(FLOWS_PAGE_PATH);

        expect(
            await screen.findByRole("heading", { name: "Nenhum fluxo ainda" }),
        ).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Novo fluxo" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Importar" })).toBeInTheDocument();
    });

    it("lists each flow with its latest version and when it was updated", async () => {
        stubFetchRoutes(fakeFlowsApi([ISSUES_TO_PR, HOTFIX]));

        renderAppAt(FLOWS_PAGE_PATH);

        const publishedRow = await screen.findByRole("row", { name: /Issues para PR/ });
        expect(within(publishedRow).getByText("v3")).toBeInTheDocument();
        expect(within(publishedRow).getByText(/10\/11\/2026/)).toBeInTheDocument();
        const draftOnlyRow = screen.getByRole("row", { name: /Hotfix/ });
        expect(within(draftOnlyRow).getByText("Não publicado")).toBeInTheDocument();
    });

    it("links each flow to its editor", async () => {
        stubFetchRoutes(fakeFlowsApi([HOTFIX]));

        renderAppAt(FLOWS_PAGE_PATH);

        expect(await screen.findByRole("link", { name: "Hotfix" })).toHaveAttribute(
            "href",
            `${FLOWS_PAGE_PATH}/flw_hotfix`,
        );
    });

    it("hides archived flows until the user asks to show them", async () => {
        const user = userEvent.setup();
        stubFetchRoutes(fakeFlowsApi([HOTFIX, LEGACY]));
        renderAppAt(FLOWS_PAGE_PATH);
        await screen.findByRole("row", { name: /Hotfix/ });
        expect(screen.queryByRole("row", { name: /Legado/ })).not.toBeInTheDocument();

        await user.click(screen.getByRole("switch", { name: "Mostrar arquivados" }));

        const archivedRow = screen.getByRole("row", { name: /Legado/ });
        expect(within(archivedRow).getByText("Arquivado")).toBeInTheDocument();
    });

    describe("new flow", () => {
        it("creates a flow from the basic factory template and opens it in the editor", async () => {
            const user = userEvent.setup();
            const created = buildFlowSummary({ id: "flw_nova", name: "Fábrica" });
            const fetchSpy = stubFetchRoutes(
                fakeFlowsApi([], {
                    [`POST ${FLOWS_URL}/from-template`]: () =>
                        Response.json(created, { status: HTTP_CREATED }),
                }),
            );
            const router = renderAppAt(FLOWS_PAGE_PATH);

            await user.click(await screen.findByRole("button", { name: "Novo fluxo" }));
            const dialog = screen.getByRole("dialog", { name: "Novo fluxo" });
            await user.click(await within(dialog).findByRole("radio", { name: /Fábrica básica/ }));
            await user.type(within(dialog).getByLabelText("Nome"), "Fábrica");
            await user.click(within(dialog).getByRole("button", { name: "Criar fluxo" }));

            await vi.waitFor(() =>
                expect(router.state.location.pathname).toBe(`${FLOWS_PAGE_PATH}/flw_nova`),
            );
            expect(listSentWrites(fetchSpy)).toEqual([
                {
                    method: "POST",
                    url: `${FLOWS_URL}/from-template`,
                    body: { name: "Fábrica", templateId: "basic-factory" },
                },
            ]);
        });

        it("offers a card for every template besides the blank flow", async () => {
            const user = userEvent.setup();
            stubFetchRoutes(fakeFlowsApi([]));
            renderAppAt(FLOWS_PAGE_PATH);

            await user.click(await screen.findByRole("button", { name: "Novo fluxo" }));

            const dialog = screen.getByRole("dialog", { name: "Novo fluxo" });
            expect(
                await within(dialog).findByRole("radio", { name: /Dev ↔ Review em loop/ }),
            ).toBeInTheDocument();
            expect(within(dialog).getByRole("radio", { name: /Em branco/ })).toBeChecked();
        });

        it("creates a blank flow when no template is chosen", async () => {
            const user = userEvent.setup();
            const fetchSpy = stubFetchRoutes(
                fakeFlowsApi([], {
                    [`POST ${FLOWS_URL}`]: () => Response.json(HOTFIX, { status: HTTP_CREATED }),
                }),
            );
            renderAppAt(FLOWS_PAGE_PATH);

            await user.click(await screen.findByRole("button", { name: "Novo fluxo" }));
            await user.type(screen.getByLabelText("Nome"), "Hotfix");
            await user.click(screen.getByRole("button", { name: "Criar fluxo" }));

            await vi.waitFor(() =>
                expect(listSentWrites(fetchSpy)).toEqual([
                    { method: "POST", url: FLOWS_URL, body: { name: "Hotfix" } },
                ]),
            );
        });

        it("requires a name", async () => {
            const user = userEvent.setup();
            stubFetchRoutes(fakeFlowsApi([]));
            renderAppAt(FLOWS_PAGE_PATH);

            await user.click(await screen.findByRole("button", { name: "Novo fluxo" }));

            expect(screen.getByLabelText("Nome")).toBeRequired();
        });
    });

    describe("import", () => {
        function buildFlowFile(yaml: string): File {
            return new File([yaml], "issues-para-pr.forja.yaml", { type: "application/yaml" });
        }

        it("sends the chosen file and opens the imported flow", async () => {
            const user = userEvent.setup();
            const yaml = "forja: 1\nname: Hotfix\n";
            const fetchSpy = stubFetchRoutes(
                fakeFlowsApi([], {
                    [`POST ${FLOWS_URL}/import`]: () =>
                        Response.json(HOTFIX, { status: HTTP_CREATED }),
                }),
            );
            const router = renderAppAt(FLOWS_PAGE_PATH);

            await user.upload(
                await screen.findByLabelText("Arquivo do fluxo"),
                buildFlowFile(yaml),
            );

            await vi.waitFor(() =>
                expect(router.state.location.pathname).toBe(`${FLOWS_PAGE_PATH}/flw_hotfix`),
            );
            expect(listSentWrites(fetchSpy)).toEqual([
                { method: "POST", url: `${FLOWS_URL}/import`, body: yaml },
            ]);
        });

        it("shows where an invalid file is broken", async () => {
            const user = userEvent.setup();
            stubFetchRoutes(
                fakeFlowsApi([], {
                    [`POST ${FLOWS_URL}/import`]: () =>
                        respondWithApiError(HTTP_UNPROCESSABLE_ENTITY, BROKEN_YAML_MESSAGE),
                }),
            );
            renderAppAt(FLOWS_PAGE_PATH);

            await user.upload(
                await screen.findByLabelText("Arquivo do fluxo"),
                buildFlowFile("forja: 1\nname: [Hotfix\n"),
            );

            expect(await screen.findByRole("alert")).toHaveTextContent(BROKEN_YAML_MESSAGE);
        });
    });

    describe("row actions", () => {
        it("marks a flow as default and takes the star off the previous default", async () => {
            const user = userEvent.setup();
            let flows = [ISSUES_TO_PR, HOTFIX];
            const fetchSpy = stubFetchRoutes(
                fakeFlowsApi([], {
                    [`GET ${LIST_FLOWS_URL}`]: () => Response.json(flows),
                    "POST /api/flows/flw_hotfix/default": () => {
                        flows = [
                            { ...ISSUES_TO_PR, isDefault: false },
                            { ...HOTFIX, isDefault: true },
                        ];
                        return new Response(null, { status: HTTP_NO_CONTENT });
                    },
                }),
            );
            renderAppAt(FLOWS_PAGE_PATH);

            await user.click(
                await screen.findByRole("button", { name: "Marcar Hotfix como padrão" }),
            );

            await vi.waitFor(() =>
                expect(
                    screen.getByRole("button", { name: "Marcar Hotfix como padrão" }),
                ).toHaveAttribute("aria-pressed", "true"),
            );
            expect(
                screen.getByRole("button", { name: "Marcar Issues para PR como padrão" }),
            ).toHaveAttribute("aria-pressed", "false");
            expect(listSentWrites(fetchSpy)).toEqual([
                { method: "POST", url: "/api/flows/flw_hotfix/default", body: undefined },
            ]);
        });

        it("renames a flow", async () => {
            const user = userEvent.setup();
            const fetchSpy = stubFetchRoutes(
                fakeFlowsApi([HOTFIX], {
                    "PATCH /api/flows/flw_hotfix": () =>
                        Response.json({ ...HOTFIX, name: "Correção urgente" }),
                }),
            );
            renderAppAt(FLOWS_PAGE_PATH);

            await user.click(await screen.findByRole("button", { name: "Renomear Hotfix" }));
            const nameField = screen.getByLabelText("Nome");
            await user.clear(nameField);
            await user.type(nameField, "Correção urgente");
            await user.click(screen.getByRole("button", { name: "Renomear" }));

            await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
            expect(listSentWrites(fetchSpy)).toEqual([
                {
                    method: "PATCH",
                    url: "/api/flows/flw_hotfix",
                    body: { name: "Correção urgente" },
                },
            ]);
        });

        it("archives a flow", async () => {
            const user = userEvent.setup();
            let flows = [HOTFIX];
            stubFetchRoutes(
                fakeFlowsApi([], {
                    [`GET ${LIST_FLOWS_URL}`]: () => Response.json(flows),
                    "POST /api/flows/flw_hotfix/archive": () => {
                        flows = [{ ...HOTFIX, archived: true }];
                        return new Response(null, { status: HTTP_NO_CONTENT });
                    },
                }),
            );
            renderAppAt(FLOWS_PAGE_PATH);

            await user.click(await screen.findByRole("button", { name: "Arquivar Hotfix" }));

            await vi.waitFor(() =>
                expect(screen.queryByRole("row", { name: /Hotfix/ })).not.toBeInTheDocument(),
            );
        });

        it("downloads the published version or the draft", async () => {
            stubFetchRoutes(fakeFlowsApi([ISSUES_TO_PR]));
            renderAppAt(FLOWS_PAGE_PATH);

            const row = await screen.findByRole("row", { name: /Issues para PR/ });

            expect(
                within(row).getByRole("link", { name: "Versão publicada (v3)" }),
            ).toHaveAttribute("href", "/api/flows/flw_issues/export?version=3");
            expect(within(row).getByRole("link", { name: "Rascunho" })).toHaveAttribute(
                "href",
                "/api/flows/flw_issues/export?version=draft",
            );
        });

        it("offers only the draft for export while nothing is published", async () => {
            stubFetchRoutes(fakeFlowsApi([HOTFIX]));
            renderAppAt(FLOWS_PAGE_PATH);

            const row = await screen.findByRole("row", { name: /Hotfix/ });

            expect(within(row).queryByRole("link", { name: /Versão publicada/ })).toBeNull();
            expect(within(row).getByRole("link", { name: "Rascunho" })).toBeInTheDocument();
        });
    });
});
