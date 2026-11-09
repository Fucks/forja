import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import type { FlowDraft, FlowSummary } from "@/shared/flow_types.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { respondWithApiError, stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import type { FakeRoutes } from "@/test/fakes/fake_fetch.js";
import { renderAppAt } from "@/test/render_app_at.js";
import { DraftConflictBanner } from "@/web/app/flows/draft_conflict_banner.js";

const PROJECT_ID = "prj_forja";
const FLOW_ID = "flw_canonico";
const EDITOR_PATH = `/projects/${PROJECT_ID}/flows/${FLOW_ID}`;
const DRAFT_URL = `/api/flows/${FLOW_ID}/draft`;
const HTTP_NOT_FOUND = 404;

const CANONICAL_DRAFT: FlowDraft = {
    flowId: FLOW_ID,
    graph: buildCanonicalFlow(),
    revision: 1,
    updatedAt: "2026-11-09T12:00:00Z",
};

const CANONICAL_SUMMARY: FlowSummary = {
    id: FLOW_ID,
    projectId: PROJECT_ID,
    name: "Issues para PR",
    isDefault: true,
    archived: false,
    draftUpdatedAt: "2026-11-09T12:00:00Z",
    draftRevision: 1,
};

function fakeEditorApi(): FakeRoutes {
    return {
        [`GET ${DRAFT_URL}`]: () => Response.json(CANONICAL_DRAFT),
        [`GET /api/projects/${PROJECT_ID}/flows`]: () => Response.json([CANONICAL_SUMMARY]),
    };
}

describe("FlowEditorPage", () => {
    it("shows the flow's name in the top bar", async () => {
        stubFetchRoutes(fakeEditorApi());

        renderAppAt(EDITOR_PATH);

        expect(
            await screen.findByRole("heading", { level: 1, name: "Issues para PR" }),
        ).toBeInTheDocument();
    });

    it("shows the draft as saved when it opens", async () => {
        stubFetchRoutes(fakeEditorApi());

        renderAppAt(EDITOR_PATH);

        expect(await screen.findByRole("status")).toHaveTextContent("Salvo");
    });

    it("draws the draft's nodes on the canvas", async () => {
        stubFetchRoutes(fakeEditorApi());

        renderAppAt(EDITOR_PATH);

        expect((await screen.findAllByLabelText("Reviewer")).length).toBeGreaterThan(0);
    });

    it("places the palette and the inspector beside the canvas", async () => {
        stubFetchRoutes(fakeEditorApi());

        renderAppAt(EDITOR_PATH);

        expect(await screen.findByRole("complementary", { name: "Paleta" })).toBeInTheDocument();
        expect(screen.getByRole("complementary", { name: "Inspector" })).toBeInTheDocument();
    });

    it("collapses a side panel", async () => {
        stubFetchRoutes(fakeEditorApi());
        renderAppAt(EDITOR_PATH);

        await userEvent.click(await screen.findByRole("button", { name: "Recolher Paleta" }));

        expect(screen.getByRole("button", { name: "Mostrar Paleta" })).toHaveAttribute(
            "aria-expanded",
            "false",
        );
    });

    it("tells the user when the draft cannot be opened", async () => {
        stubFetchRoutes({
            ...fakeEditorApi(),
            [`GET ${DRAFT_URL}`]: () =>
                respondWithApiError(HTTP_NOT_FOUND, "Fluxo não encontrado."),
        });

        renderAppAt(EDITOR_PATH);

        expect(
            await screen.findByRole("heading", { name: "Não foi possível abrir o rascunho" }),
        ).toBeInTheDocument();
        expect(screen.getByText("Fluxo não encontrado.")).toBeInTheDocument();
    });
});

describe("DraftConflictBanner", () => {
    it("asks to reload the flow changed in another tab", () => {
        render(<DraftConflictBanner onReload={() => undefined} />);

        expect(screen.getByRole("alert")).toHaveTextContent(
            "O fluxo foi alterado em outra aba. Recarregar?",
        );
    });

    it("reloads the draft when the user accepts", async () => {
        const onReload = vi.fn<() => void>();
        render(<DraftConflictBanner onReload={onReload} />);

        await userEvent.click(screen.getByRole("button", { name: "Recarregar" }));

        expect(onReload).toHaveBeenCalledOnce();
    });
});
