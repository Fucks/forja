import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { MockInstance } from "vitest";

import { TOOL_PROFILE_PRESETS } from "@/server/tool_profiles/tool_profile_presets.js";
import type { ToolProfile } from "@/shared/tool_profile_types.js";
import { ToolProfilesPage } from "@/web/app/settings/tool_profiles_page.js";
import { ToastProvider } from "@/web/components/ui/toast.js";

const REVIEWER: ToolProfile = {
    id: "tlp_revisor",
    name: "Revisor",
    description: "",
    mcpServers: [],
    allowedTools: ["Read"],
    disallowedTools: ["Write"],
    permissionMode: "bypassPermissions",
    indexCodegraphOnStart: false,
    builtin: false,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
};

const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;

interface SentRequest {
    method: string;
    url: string;
    body: unknown;
}

// Answers the list with the presets plus REVIEWER and echoes every write back as a created profile.
function fakeToolProfilesApi(): MockInstance<typeof fetch> {
    return vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
        const method = init?.method ?? "GET";
        if (method === "GET") {
            return Promise.resolve(Response.json([...TOOL_PROFILE_PRESETS, REVIEWER]));
        }
        if (method === "DELETE") {
            return Promise.resolve(new Response(null, { status: HTTP_NO_CONTENT }));
        }

        return Promise.resolve(Response.json(REVIEWER, { status: HTTP_CREATED }));
    });
}

function listWrites(fetchSpy: MockInstance<typeof fetch>): SentRequest[] {
    return fetchSpy.mock.calls
        .map(([input, init]) => ({
            method: init?.method ?? "GET",
            url: readRequestUrl(input),
            body: parseSentBody(init?.body),
        }))
        .filter((request) => request.method !== "GET");
}

function readRequestUrl(input: Parameters<typeof fetch>[0]): string {
    if (typeof input === "string") {
        return input;
    }

    return input instanceof URL ? input.href : input.url;
}

function parseSentBody(body: BodyInit | null | undefined): unknown {
    return typeof body === "string" ? (JSON.parse(body) as unknown) : undefined;
}

function renderPage(): void {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={queryClient}>
            <ToastProvider>
                <ToolProfilesPage />
            </ToastProvider>
        </QueryClientProvider>,
    );
}

async function findProfileCard(name: string): Promise<HTMLElement> {
    return screen.findByRole("article", { name });
}

describe("ToolProfilesPage", () => {
    it("lists the presets marked as builtin, offering only duplication", async () => {
        fakeToolProfilesApi();
        renderPage();

        const codegraph = await findProfileCard("CodeGraph");

        expect(within(codegraph).getByText("embutido")).toBeInTheDocument();
        expect(within(codegraph).getByText("codegraph")).toBeInTheDocument();
        expect(within(codegraph).getByRole("button", { name: "Duplicar CodeGraph" })).toBeVisible();
        expect(within(codegraph).queryByRole("button", { name: /Editar|Remover/ })).toBeNull();
        expect(await findProfileCard("Somente leitura")).toBeInTheDocument();
        expect(await findProfileCard("Padrão")).toBeInTheDocument();
    });

    it("creates a profile with one MCP server and two allowed tools", async () => {
        const user = userEvent.setup();
        const fetchSpy = fakeToolProfilesApi();
        renderPage();

        await user.click(screen.getByRole("button", { name: "Novo perfil" }));
        await user.type(screen.getByLabelText("Nome"), "Explorador");
        await user.click(screen.getByRole("button", { name: "Adicionar MCP" }));
        await user.type(screen.getByLabelText("Nome do MCP"), "codegraph");
        await user.type(screen.getByLabelText("Comando"), "codegraph");
        await user.type(screen.getByLabelText("Argumentos"), "serve{Enter}--mcp");
        const allowedTools = screen.getByLabelText("Ferramentas permitidas");
        await user.type(allowedTools, "Read{Enter}");
        await user.type(allowedTools, "mcp__codegraph__*{Enter}");
        await user.click(screen.getByRole("button", { name: "Salvar" }));

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(listWrites(fetchSpy)).toEqual([
            {
                method: "POST",
                url: "/api/tool-profiles",
                body: {
                    name: "Explorador",
                    description: "",
                    mcpServers: [
                        {
                            name: "codegraph",
                            command: "codegraph",
                            args: ["serve", "--mcp"],
                            env: {},
                        },
                    ],
                    allowedTools: ["Read", "mcp__codegraph__*"],
                    disallowedTools: [],
                    permissionMode: "bypassPermissions",
                    indexCodegraphOnStart: false,
                },
            },
        ]);
    });

    it("warns that bypassPermissions leaves the container as the security boundary", async () => {
        const user = userEvent.setup();
        fakeToolProfilesApi();
        renderPage();

        await user.click(screen.getByRole("button", { name: "Novo perfil" }));

        expect(screen.getByRole("note")).toHaveTextContent(
            "o container é a fronteira de segurança",
        );
    });

    it("edits a custom profile starting from its current configuration", async () => {
        const user = userEvent.setup();
        const fetchSpy = fakeToolProfilesApi();
        renderPage();

        const reviewer = await findProfileCard("Revisor");
        await user.click(within(reviewer).getByRole("button", { name: "Editar Revisor" }));
        await user.click(screen.getByRole("button", { name: "Remover Write" }));
        await user.click(screen.getByRole("button", { name: "Salvar" }));

        await waitFor(() => expect(listWrites(fetchSpy)).toHaveLength(1));
        expect(listWrites(fetchSpy)[0]).toEqual({
            method: "PUT",
            url: "/api/tool-profiles/tlp_revisor",
            body: {
                name: "Revisor",
                description: "",
                mcpServers: [],
                allowedTools: ["Read"],
                disallowedTools: [],
                permissionMode: "bypassPermissions",
                indexCodegraphOnStart: false,
            },
        });
    });

    it("duplicates a preset", async () => {
        const user = userEvent.setup();
        const fetchSpy = fakeToolProfilesApi();
        renderPage();

        const codegraph = await findProfileCard("CodeGraph");
        await user.click(within(codegraph).getByRole("button", { name: "Duplicar CodeGraph" }));

        await waitFor(() =>
            expect(listWrites(fetchSpy)).toEqual([
                {
                    method: "POST",
                    url: "/api/tool-profiles/tlp_builtin_codegraph/duplicate",
                    body: undefined,
                },
            ]),
        );
    });

    it("removes a custom profile", async () => {
        const user = userEvent.setup();
        const fetchSpy = fakeToolProfilesApi();
        renderPage();

        const reviewer = await findProfileCard("Revisor");
        await user.click(within(reviewer).getByRole("button", { name: "Remover Revisor" }));

        await waitFor(() =>
            expect(listWrites(fetchSpy)).toEqual([
                { method: "DELETE", url: "/api/tool-profiles/tlp_revisor", body: undefined },
            ]),
        );
    });
});
