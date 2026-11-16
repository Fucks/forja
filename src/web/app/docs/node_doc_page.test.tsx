import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import { stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import { renderAppAt } from "@/test/render_app_at.js";

const NODE_DOCS_COUNT = 10;

beforeEach(() => {
    stubFetchRoutes({ "GET /api/projects": () => Response.json([]) });
});

function listNodeDocLinks(): HTMLElement[] {
    return within(screen.getByRole("main"))
        .getAllByRole("region")
        .flatMap((categoryGroup) => within(categoryGroup).getAllByRole("link"));
}

describe("NodeDocPage", () => {
    it("shows the documentation of the Decision node", () => {
        renderAppAt("/docs/nodes/condition");

        expect(screen.getByRole("heading", { level: 1, name: "Decisão" })).toBeInTheDocument();
        expect(
            screen.getByText("Se a regra for verdadeira, segue por Sim; senão, por Não"),
        ).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 2, name: "Quando usar" })).toBeInTheDocument();
    });

    it("lists the ports with their technical name and type", () => {
        renderAppAt("/docs/nodes/condition");

        const inputsTable = screen.getByRole("table", { name: "Entradas" });
        const valueRow = within(inputsTable).getByRole("row", { name: /O que passa adiante/ });
        expect(within(valueRow).getByText("value")).toBeInTheDocument();
        expect(within(valueRow).getByText("json")).toBeInTheDocument();
    });

    it("shows each field with its technical name, default and options", () => {
        renderAppAt("/docs/nodes/agent");

        expect(screen.getByText("effort")).toBeInTheDocument();
        expect(screen.getAllByText("Vazio (usa o do projeto)").length).toBeGreaterThan(0);
        expect(screen.getByText("Rápido e barato.")).toBeInTheDocument();
    });

    it("shows the example config in a code block", () => {
        renderAppAt("/docs/nodes/condition");

        const example = screen.getByRole("heading", { level: 3, name: "Testes passaram?" });
        expect(example.parentElement).toHaveTextContent('"path": "exitCode"');
    });

    it("links the related nodes to their pages", () => {
        renderAppAt("/docs/nodes/condition");

        expect(screen.getByRole("link", { name: "Agente" })).toHaveAttribute(
            "href",
            "/docs/nodes/agent",
        );
    });

    it("says the node was not found for an unknown type, with a link to the index", () => {
        renderAppAt("/docs/nodes/xyz");

        expect(
            screen.getByRole("heading", { level: 1, name: "Nó não encontrado" }),
        ).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Ver todos os nós" })).toHaveAttribute(
            "href",
            "/docs/nodes",
        );
    });
});

describe("NodeDocsIndexPage", () => {
    it("lists every node grouped by category", () => {
        renderAppAt("/docs/nodes");

        expect(listNodeDocLinks()).toHaveLength(NODE_DOCS_COUNT);
        const decideGroup = screen.getByRole("region", { name: "Decidir" });
        expect(within(decideGroup).getByRole("link", { name: /Decisão/ })).toHaveAttribute(
            "href",
            "/docs/nodes/condition",
        );
    });

    it("finds a node by a sentence of when to use it", async () => {
        const user = userEvent.setup();
        renderAppAt("/docs/nodes");

        await user.type(
            screen.getByRole("searchbox", { name: "Buscar nós" }),
            "instalar dependências",
        );

        expect(listNodeDocLinks()).toHaveLength(1);
        expect(screen.getByRole("link", { name: /Comando/ })).toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Grupos" })).not.toBeInTheDocument();
    });

    it("says no node matches when the search finds nothing", async () => {
        const user = userEvent.setup();
        renderAppAt("/docs/nodes");

        await user.type(screen.getByRole("searchbox", { name: "Buscar nós" }), "xyzzy");

        expect(screen.getByText("Nenhum nó com esse termo")).toBeInTheDocument();
    });
});
