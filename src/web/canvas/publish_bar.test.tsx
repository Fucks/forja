import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ComponentProps } from "react";

import type { FlowVersion } from "@/shared/flow_types.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import {
    listSentWrites,
    REFUSED_PUBLISH_MESSAGE,
    respondWithRefusedPublish,
    stubFetchRoutes,
} from "@/test/fakes/fake_fetch.js";
import { createTestQueryClient } from "@/test/render_with_query_client.js";
import { PublishBar } from "@/web/canvas/publish_bar.js";
import { ToastProvider } from "@/web/components/ui/toast.js";

const FLOW_ID = "flw_canonico";
const PUBLISH_ROUTE = `POST /api/flows/${FLOW_ID}/publish`;
const HTTP_CREATED = 201;

const PUBLISHED_VERSION: FlowVersion = {
    flowId: FLOW_ID,
    version: 4,
    graph: buildCanonicalFlow(),
    publishedAt: "2026-11-11T12:00:00Z",
    note: "Revisão em dois passos",
};

const NO_TRIGGER_ISSUE: ValidationIssue = {
    level: "error",
    code: "no_trigger",
    message: "O fluxo precisa de um nó de gatilho.",
    target: { kind: "flow" },
};

type PublishBarProps = ComponentProps<typeof PublishBar>;

describe("PublishBar", () => {
    it("tells that the draft is being edited and which version is published", () => {
        renderPublishBar({ latestVersion: 3 });

        expect(screen.getByText("Rascunho · última versão publicada v3")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Publicar v4" })).toBeInTheDocument();
    });

    it("offers the first version when nothing was published yet", () => {
        renderPublishBar({ latestVersion: undefined });

        expect(screen.getByText("Rascunho · nenhuma versão publicada")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Publicar v1" })).toBeInTheDocument();
    });

    it("blocks publishing while the draft has errors", async () => {
        const fetchSpy = stubFetchRoutes({});
        renderPublishBar({ errorCount: 2 });

        await userEvent.click(screen.getByRole("button", { name: "Publicar v4" }));

        expect(screen.getByRole("button", { name: "Publicar v4" })).toHaveAttribute(
            "aria-disabled",
            "true",
        );
        expect(listSentWrites(fetchSpy)).toEqual([]);
    });

    it.each([
        { errorCount: 2, reason: "Corrija 2 erros" },
        { errorCount: 1, reason: "Corrija 1 erro" },
    ])("tells to fix the errors when there are $errorCount", async ({ errorCount, reason }) => {
        renderPublishBar({ errorCount });

        await userEvent.hover(screen.getByRole("button", { name: "Publicar v4" }));

        expect(await screen.findByRole("tooltip", { name: reason })).toBeInTheDocument();
    });

    it("has nothing to publish when the draft equals the latest version", async () => {
        const fetchSpy = stubFetchRoutes({});
        renderPublishBar({ draftDiffers: false });

        await userEvent.click(screen.getByRole("button", { name: "Nada novo para publicar" }));

        expect(screen.getByRole("button", { name: "Nada novo para publicar" })).toHaveAttribute(
            "aria-disabled",
            "true",
        );
        expect(listSentWrites(fetchSpy)).toEqual([]);
    });

    it("publishes the draft with the note", async () => {
        const fetchSpy = stubPublishResponse(
            Response.json(PUBLISHED_VERSION, { status: HTTP_CREATED }),
        );
        renderPublishBar();

        await userEvent.type(screen.getByLabelText("Nota da versão"), "Revisão em dois passos");
        await userEvent.click(screen.getByRole("button", { name: "Publicar v4" }));

        await waitFor(() =>
            expect(listSentWrites(fetchSpy)).toEqual([
                expect.objectContaining({ body: { note: "Revisão em dois passos" } }),
            ]),
        );
    });

    it("publishes without a note when the field is blank", async () => {
        const fetchSpy = stubPublishResponse(
            Response.json(PUBLISHED_VERSION, { status: HTTP_CREATED }),
        );
        renderPublishBar();

        await userEvent.type(screen.getByLabelText("Nota da versão"), "   ");
        await userEvent.click(screen.getByRole("button", { name: "Publicar v4" }));

        await waitFor(() =>
            expect(listSentWrites(fetchSpy)).toEqual([expect.objectContaining({ body: {} })]),
        );
    });

    it("announces the new version and hands it to the editor", async () => {
        stubPublishResponse(Response.json(PUBLISHED_VERSION, { status: HTTP_CREATED }));
        const onPublished = vi.fn<PublishBarProps["onPublished"]>();
        renderPublishBar({ onPublished });

        await userEvent.click(screen.getByRole("button", { name: "Publicar v4" }));

        expect(await screen.findByText("v4 publicada")).toBeInTheDocument();
        expect(onPublished).toHaveBeenCalledWith(PUBLISHED_VERSION);
    });

    it("clears the note after publishing", async () => {
        stubPublishResponse(Response.json(PUBLISHED_VERSION, { status: HTTP_CREATED }));
        renderPublishBar();

        await userEvent.type(screen.getByLabelText("Nota da versão"), "Revisão em dois passos");
        await userEvent.click(screen.getByRole("button", { name: "Publicar v4" }));

        await waitFor(() => expect(screen.getByLabelText("Nota da versão")).toHaveValue(""));
    });

    it("hands the server's issues to the editor when the publish is refused", async () => {
        stubPublishResponse(respondWithRefusedPublish([NO_TRIGGER_ISSUE]));
        const onRejected = vi.fn<PublishBarProps["onRejected"]>();
        const onPublished = vi.fn<PublishBarProps["onPublished"]>();
        renderPublishBar({ onRejected, onPublished });

        await userEvent.click(screen.getByRole("button", { name: "Publicar v4" }));

        await waitFor(() => expect(onRejected).toHaveBeenCalledWith([NO_TRIGGER_ISSUE]));
        expect(onPublished).not.toHaveBeenCalled();
    });

    it("shows the server's message when the publish is refused", async () => {
        stubPublishResponse(respondWithRefusedPublish([NO_TRIGGER_ISSUE]));
        renderPublishBar();

        await userEvent.click(screen.getByRole("button", { name: "Publicar v4" }));

        expect(await screen.findByText(REFUSED_PUBLISH_MESSAGE)).toBeInTheDocument();
    });
});

function renderPublishBar(overrides: Partial<PublishBarProps> = {}): void {
    const props: PublishBarProps = {
        flowId: FLOW_ID,
        latestVersion: 3,
        draftDiffers: true,
        errorCount: 0,
        onPublished: vi.fn(),
        onRejected: vi.fn(),
        ...overrides,
    };

    render(
        <QueryClientProvider client={createTestQueryClient()}>
            <ToastProvider>
                <PublishBar {...props} />
            </ToastProvider>
        </QueryClientProvider>,
    );
}

function stubPublishResponse(response: Response): ReturnType<typeof stubFetchRoutes> {
    return stubFetchRoutes({ [PUBLISH_ROUTE]: () => response });
}
