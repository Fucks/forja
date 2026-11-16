import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import { InspectorTabs } from "@/web/canvas/inspector/inspector_tabs.js";
import type { DocumentedType } from "@/web/docs/node_docs/node_doc.js";

beforeEach(() => {
    localStorage.clear();
});

describe("InspectorTabs", () => {
    it("opens on Configurar", () => {
        renderTabs("agent");

        expect(screen.getByRole("tab", { name: "Configurar" })).toHaveAttribute(
            "aria-selected",
            "true",
        );
        expect(screen.getByText("campos do nó")).toBeInTheDocument();
    });

    it("switches to the chosen tab", async () => {
        renderTabs("agent");

        await userEvent.click(screen.getByRole("tab", { name: "Dados" }));

        expect(screen.getByText("entradas e saídas")).toBeInTheDocument();
        expect(screen.queryByText("campos do nó")).not.toBeInTheDocument();
    });

    it("moves between the tabs with the arrow keys", async () => {
        renderTabs("agent");

        screen.getByRole("tab", { name: "Configurar" }).focus();
        await userEvent.keyboard("{ArrowRight}");

        expect(screen.getByRole("tab", { name: "Dados" })).toHaveFocus();
        expect(screen.getByText("entradas e saídas")).toBeInTheDocument();
    });

    it("reopens on the tab last chosen for the same node type", async () => {
        const firstInspector = renderTabs("agent");
        await userEvent.click(screen.getByRole("tab", { name: "Ajuda" }));
        firstInspector.unmount();

        renderTabs("agent");

        expect(screen.getByText("documentação")).toBeInTheDocument();
    });

    it("keeps each node type on its own tab", async () => {
        const agentInspector = renderTabs("agent");
        await userEvent.click(screen.getByRole("tab", { name: "Ajuda" }));
        agentInspector.unmount();

        renderTabs("script");

        expect(screen.getByText("campos do nó")).toBeInTheDocument();
    });

    it("still switches tabs when the browser refuses the storage", async () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new DOMException("denied", "SecurityError");
        });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new DOMException("denied", "SecurityError");
        });
        renderTabs("agent");

        await userEvent.click(screen.getByRole("tab", { name: "Dados" }));

        expect(screen.getByText("entradas e saídas")).toBeInTheDocument();
    });
});

function renderTabs(type: DocumentedType): ReturnType<typeof render> {
    return render(
        <InspectorTabs
            type={type}
            configure={<p>campos do nó</p>}
            data={<p>entradas e saídas</p>}
            help={<p>documentação</p>}
        />,
    );
}
