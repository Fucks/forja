import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { MockInstance } from "vitest";

import type { CredentialSummary } from "@/shared/credential_types.js";
import { listSentWrites, stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import { renderAppAt } from "@/test/render_app_at.js";

const CREDENTIALS_PAGE_PATH = "/settings/credentials";
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const CHECKED_AT = "2026-06-03T09:00:00.000Z";

const ANTHROPIC_KEY: CredentialSummary = {
    id: "cred_anthropic",
    name: "Anthropic pessoal",
    kind: "anthropic_api_key",
    masked: "sk-ant-api03-…a1b2",
    envVar: "ANTHROPIC_API_KEY",
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
};

const GITHUB_TOKEN: CredentialSummary = {
    id: "cred_github",
    name: "GitHub",
    kind: "github_token",
    masked: "ghp_…9z8y",
    envVar: "GH_TOKEN",
    lastCheckedAt: "2026-06-02T15:30:00.000Z",
    lastCheckOk: true,
    createdAt: "2026-06-01T11:00:00.000Z",
    updatedAt: "2026-06-01T11:00:00.000Z",
};

function stubCredentialsApi(): MockInstance<typeof fetch> {
    return stubFetchRoutes({
        "GET /api/credentials": () => Response.json([ANTHROPIC_KEY, GITHUB_TOKEN]),
        "POST /api/credentials": () => Response.json(ANTHROPIC_KEY, { status: HTTP_CREATED }),
        "PATCH /api/credentials/cred_anthropic": () => Response.json(ANTHROPIC_KEY),
        "DELETE /api/credentials/cred_anthropic": () =>
            new Response(null, { status: HTTP_NO_CONTENT }),
    });
}

async function findCredentialRow(name: string): Promise<HTMLElement> {
    return screen.findByRole("row", { name: new RegExp(name) });
}

describe("CredentialsPage", () => {
    it("lists the credentials with type, masked value, variable and last check", async () => {
        stubCredentialsApi();

        renderAppAt(CREDENTIALS_PAGE_PATH);

        const anthropicRow = await findCredentialRow("Anthropic pessoal");
        expect(within(anthropicRow).getByText("API key da Anthropic")).toBeInTheDocument();
        expect(within(anthropicRow).getByText("sk-ant-api03-…a1b2")).toHaveClass("font-mono");
        expect(within(anthropicRow).getByText("ANTHROPIC_API_KEY")).toBeInTheDocument();
        expect(within(anthropicRow).getByText("Nunca testada")).toBeInTheDocument();
        const githubRow = await findCredentialRow("GitHub");
        expect(within(githubRow).getByText(/^OK/)).toBeInTheDocument();
    });

    it("tests a credential and shows the result in its row", async () => {
        const user = userEvent.setup();
        const checkedKey = { ...ANTHROPIC_KEY, lastCheckedAt: CHECKED_AT, lastCheckOk: true };
        let isChecked = false;
        const fetchSpy = stubFetchRoutes({
            "GET /api/credentials": () =>
                Response.json([isChecked ? checkedKey : ANTHROPIC_KEY, GITHUB_TOKEN]),
            "POST /api/credentials/cred_anthropic/check": () => {
                isChecked = true;
                return Response.json({ ok: true, message: "Credencial válida" });
            },
        });
        renderAppAt(CREDENTIALS_PAGE_PATH);

        const row = await findCredentialRow("Anthropic pessoal");
        await user.click(within(row).getByRole("button", { name: "Testar Anthropic pessoal" }));

        expect(await within(row).findByText("Credencial válida")).toBeInTheDocument();
        expect(await within(row).findByText(/^OK ·/)).toBeInTheDocument();
        expect(listSentWrites(fetchSpy)).toEqual([
            { method: "POST", url: "/api/credentials/cred_anthropic/check", body: undefined },
        ]);
    });

    it("shows the error of the agent when the test fails", async () => {
        const user = userEvent.setup();
        stubFetchRoutes({
            "GET /api/credentials": () => Response.json([ANTHROPIC_KEY]),
            "POST /api/credentials/cred_anthropic/check": () =>
                Response.json({ ok: false, message: "Invalid API key" }),
        });
        renderAppAt(CREDENTIALS_PAGE_PATH);

        const row = await findCredentialRow("Anthropic pessoal");
        await user.click(within(row).getByRole("button", { name: "Testar Anthropic pessoal" }));

        expect(await within(row).findByText("Invalid API key")).toHaveClass("text-status-failed");
    });

    it("offers to create the first credential when there are none", async () => {
        stubFetchRoutes({ "GET /api/credentials": () => Response.json([]) });

        renderAppAt(CREDENTIALS_PAGE_PATH);

        expect(
            await screen.findByRole("heading", { name: "Nenhuma credencial ainda" }),
        ).toBeInTheDocument();
    });

    it("creates a Claude token, hiding the value unless asked to show it", async () => {
        const user = userEvent.setup();
        const fetchSpy = stubCredentialsApi();
        renderAppAt(CREDENTIALS_PAGE_PATH);

        await user.click(await screen.findByRole("button", { name: "Nova credencial" }));
        const dialog = screen.getByRole("dialog", { name: "Nova credencial" });
        await user.type(within(dialog).getByLabelText("Nome"), "Assinatura");
        await user.click(within(dialog).getByRole("combobox", { name: "Tipo" }));
        await user.click(screen.getByRole("option", { name: "Token do Claude (assinatura)" }));
        const valueField = within(dialog).getByLabelText("Valor");
        await user.type(valueField, "sk-ant-oat01-segredo");

        expect(valueField).toHaveAttribute("type", "password");
        expect(valueField).toHaveAccessibleDescription(/claude setup-token/);
        await user.click(within(dialog).getByRole("button", { name: "Mostrar enquanto digito" }));
        expect(valueField).toHaveAttribute("type", "text");

        await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(listSentWrites(fetchSpy)).toEqual([
            {
                method: "POST",
                url: "/api/credentials",
                body: {
                    name: "Assinatura",
                    kind: "claude_oauth_token",
                    value: "sk-ant-oat01-segredo",
                },
            },
        ]);
    });

    it("asks for the environment variable of a generic credential", async () => {
        const user = userEvent.setup();
        const fetchSpy = stubCredentialsApi();
        renderAppAt(CREDENTIALS_PAGE_PATH);

        await user.click(await screen.findByRole("button", { name: "Nova credencial" }));
        const dialog = screen.getByRole("dialog", { name: "Nova credencial" });
        expect(within(dialog).queryByLabelText("Variável de ambiente")).toBeNull();
        await user.type(within(dialog).getByLabelText("Nome"), "Sentry");
        await user.click(within(dialog).getByRole("combobox", { name: "Tipo" }));
        await user.click(screen.getByRole("option", { name: "Variável de ambiente" }));
        await user.type(within(dialog).getByLabelText("Variável de ambiente"), "SENTRY_TOKEN");
        await user.type(within(dialog).getByLabelText("Valor"), "sentry-segredo");
        await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

        await waitFor(() => expect(listSentWrites(fetchSpy)).toHaveLength(1));
        expect(listSentWrites(fetchSpy)[0]?.body).toEqual({
            name: "Sentry",
            kind: "generic_env",
            value: "sentry-segredo",
            envVar: "SENTRY_TOKEN",
        });
    });

    it("renames a credential without sending a value when none is typed", async () => {
        const user = userEvent.setup();
        const fetchSpy = stubCredentialsApi();
        renderAppAt(CREDENTIALS_PAGE_PATH);

        const row = await findCredentialRow("Anthropic pessoal");
        await user.click(within(row).getByRole("button", { name: "Editar Anthropic pessoal" }));
        const dialog = screen.getByRole("dialog", { name: "Editar credencial" });
        const nameField = within(dialog).getByLabelText("Nome");
        expect(within(dialog).getByLabelText("Novo valor")).toHaveValue("");
        await user.clear(nameField);
        await user.type(nameField, "Anthropic do time");
        await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

        await waitFor(() =>
            expect(listSentWrites(fetchSpy)).toEqual([
                {
                    method: "PATCH",
                    url: "/api/credentials/cred_anthropic",
                    body: { name: "Anthropic do time" },
                },
            ]),
        );
    });

    it("replaces the value of a credential", async () => {
        const user = userEvent.setup();
        const fetchSpy = stubCredentialsApi();
        renderAppAt(CREDENTIALS_PAGE_PATH);

        const row = await findCredentialRow("Anthropic pessoal");
        await user.click(within(row).getByRole("button", { name: "Editar Anthropic pessoal" }));
        const dialog = screen.getByRole("dialog", { name: "Editar credencial" });
        await user.type(within(dialog).getByLabelText("Novo valor"), "sk-ant-api03-novo");
        await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

        await waitFor(() =>
            expect(listSentWrites(fetchSpy)).toEqual([
                {
                    method: "PATCH",
                    url: "/api/credentials/cred_anthropic",
                    body: { name: "Anthropic pessoal", value: "sk-ant-api03-novo" },
                },
            ]),
        );
    });

    it("removes a credential only after confirming in a dialog that names it", async () => {
        const user = userEvent.setup();
        const fetchSpy = stubCredentialsApi();
        renderAppAt(CREDENTIALS_PAGE_PATH);

        const row = await findCredentialRow("Anthropic pessoal");
        await user.click(within(row).getByRole("button", { name: "Remover Anthropic pessoal" }));
        const confirmation = screen.getByRole("dialog", { name: "Remover credencial" });

        expect(confirmation).toHaveTextContent("Anthropic pessoal");
        expect(listSentWrites(fetchSpy)).toEqual([]);
        await user.click(within(confirmation).getByRole("button", { name: "Remover" }));
        await waitFor(() =>
            expect(listSentWrites(fetchSpy)).toEqual([
                { method: "DELETE", url: "/api/credentials/cred_anthropic", body: undefined },
            ]),
        );
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("keeps the credential when the removal is cancelled", async () => {
        const user = userEvent.setup();
        const fetchSpy = stubCredentialsApi();
        renderAppAt(CREDENTIALS_PAGE_PATH);

        const row = await findCredentialRow("Anthropic pessoal");
        await user.click(within(row).getByRole("button", { name: "Remover Anthropic pessoal" }));
        const confirmation = screen.getByRole("dialog", { name: "Remover credencial" });
        await user.click(within(confirmation).getByRole("button", { name: "Cancelar" }));

        expect(screen.queryByRole("dialog")).toBeNull();
        expect(listSentWrites(fetchSpy)).toEqual([]);
    });
});
