import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { MockInstance } from "vitest";
import { z } from "zod";

import { flowGraphSchema, isNodeOfType } from "@/shared/flow_graph.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import type { FlowDraft, FlowSummary, FlowVersion } from "@/shared/flow_types.js";
import type { AgentConfig } from "@/shared/node_configs/agent_config.js";
import { DEFAULT_PROJECT_SETTINGS } from "@/shared/settings_types.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { updateAgentConfig } from "@/test/factories/flow_graph_variations.js";
import {
    listSentWrites,
    respondWithApiError,
    respondWithRefusedPublish,
    stubFetchRoutes,
} from "@/test/fakes/fake_fetch.js";
import type { FakeRoutes } from "@/test/fakes/fake_fetch.js";
import { renderAppAt } from "@/test/render_app_at.js";
import { DraftConflictBanner } from "@/web/app/flows/draft_conflict_banner.js";
import { AUTOSAVE_DELAY_MS } from "@/web/canvas/use_flow_draft.js";
import { VALIDATION_DEBOUNCE_MS } from "@/web/canvas/use_validation.js";

const PROJECT_ID = "prj_forja";
const FLOW_ID = "flw_canonico";
const EDITOR_PATH = `/projects/${PROJECT_ID}/flows/${FLOW_ID}`;
const DRAFT_URL = `/api/flows/${FLOW_ID}/draft`;
const PROJECT_FLOWS_URL = `/api/projects/${PROJECT_ID}/flows`;
const HTTP_CREATED = 201;
const HTTP_NOT_FOUND = 404;
const TRIGGER_LABEL = "Gatilho";
const NO_TRIGGER_MESSAGE = "O fluxo precisa de um nó de gatilho.";
const EMPTY_PROMPT_MESSAGE = 'O agente "Dev" está sem prompt.';
const VALIDATION_WAIT = { timeout: VALIDATION_DEBOUNCE_MS * 2 };
const AUTOSAVE_WAIT_MS = AUTOSAVE_DELAY_MS * 3;

const draftWriteSchema = z.object({ graph: flowGraphSchema });

const CANONICAL_DRAFT: FlowDraft = {
    flowId: FLOW_ID,
    graph: buildCanonicalFlow(),
    revision: 1,
    updatedAt: "2026-11-09T12:00:00Z",
};

const GRAPH_WITH_EMPTY_PROMPT = updateAgentConfig(buildCanonicalFlow(), "dev", { prompt: "" });

const UNKNOWN_TOOL_PROFILE_ISSUE: ValidationIssue = {
    level: "error",
    code: "unknown_tool_profile",
    message: 'O agente "Dev" usa um perfil de ferramentas que não existe.',
    target: { kind: "node", id: "dev" },
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

function fakeEditorApi({
    draftGraph = CANONICAL_DRAFT.graph,
    latestVersion,
}: { draftGraph?: FlowGraph; latestVersion?: number } = {}): FakeRoutes {
    return {
        [`GET ${DRAFT_URL}`]: () => Response.json({ ...CANONICAL_DRAFT, graph: draftGraph }),
        [`PUT ${DRAFT_URL}`]: () => Response.json({ ...CANONICAL_DRAFT, revision: 2 }),
        [`GET ${PROJECT_FLOWS_URL}`]: () =>
            Response.json([{ ...CANONICAL_SUMMARY, latestVersion }]),
        [`GET /api/projects/${PROJECT_ID}/settings`]: () => Response.json(DEFAULT_PROJECT_SETTINGS),
        "GET /api/tool-profiles": () => Response.json([]),
        "GET /api/credentials": () => Response.json([]),
    };
}

function buildPublishedVersion(version: number): FlowVersion {
    return {
        flowId: FLOW_ID,
        version,
        graph: CANONICAL_DRAFT.graph,
        publishedAt: "2026-11-11T12:00:00Z",
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

    it("links to the flow's versions from the top bar", async () => {
        stubFetchRoutes(fakeEditorApi());

        renderAppAt(EDITOR_PATH);

        expect(await screen.findByRole("link", { name: "Versões" })).toHaveAttribute(
            "href",
            `${EDITOR_PATH}/versions`,
        );
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

    it("draws the node created from the palette on the canvas", async () => {
        stubFetchRoutes(fakeEditorApi());
        renderAppAt(EDITOR_PATH);
        const palette = await screen.findByRole("complementary", { name: "Paleta" });
        const canvas = screen.getByTestId("rf__wrapper");
        const outputNodeCount = within(canvas).queryAllByLabelText("Saída").length;

        await userEvent.click(within(palette).getByRole("button", { name: "Saída" }));

        expect(within(canvas).getAllByLabelText("Saída")).toHaveLength(outputNodeCount + 1);
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

    it("summarizes the flow in the inspector while no node is selected", async () => {
        stubFetchRoutes(fakeEditorApi());

        renderAppAt(EDITOR_PATH);

        const inspector = await screen.findByRole("complementary", { name: "Inspector" });
        expect(within(inspector).getByText("Selecione um nó para editar.")).toBeInTheDocument();
    });

    it("opens the selected agent in the inspector and saves its new effort", async () => {
        const fetchSpy = stubFetchRoutes(fakeEditorApi());
        renderAppAt(EDITOR_PATH);
        const inspector = await selectCanvasNode("Dev");

        await userEvent.click(within(inspector).getByRole("radio", { name: "max" }));

        expect(within(inspector).getByRole("textbox", { name: "Rótulo" })).toHaveValue("Dev");
        const savedGraph = await waitForSavedGraph(fetchSpy);
        expect(findSavedAgentConfig(savedGraph, "dev")).toMatchObject({ effort: "max" });
    });

    it("shows 'padrão' on the node once its effort goes back to the project's", async () => {
        stubFetchRoutes(fakeEditorApi());
        renderAppAt(EDITOR_PATH);
        const inspector = await selectCanvasNode("TL");

        await userEvent.click(within(inspector).getByRole("radio", { name: "padrão" }));

        expect(findCanvasNode("TL")).toHaveTextContent("effort padrão");
    });

    it("drops the connection of an input port removed in the inspector", async () => {
        const fetchSpy = stubFetchRoutes(fakeEditorApi());
        renderAppAt(EDITOR_PATH);
        const inspector = await selectCanvasNode("Dev");

        await userEvent.click(
            within(inspector).getByRole("button", { name: "Remover a entrada spec" }),
        );

        const savedGraph = await waitForSavedGraph(fetchSpy);
        expect(savedGraph.edges.filter((edge) => edge.to.nodeId === "dev")).toEqual([]);
    });

    it("opens the selected group in the inspector", async () => {
        stubFetchRoutes(fakeEditorApi());
        renderAppAt(EDITOR_PATH);

        const inspector = await selectCanvasNode("Desenvolver");

        expect(within(inspector).getByRole("textbox", { name: "Rótulo" })).toHaveValue(
            "Desenvolver",
        );
        expect(within(inspector).getByText("até 3 itens ao mesmo tempo")).toBeInTheDocument();
    });

    it("groups Dev in a map whose label follows the concurrency set in the inspector", async () => {
        stubFetchRoutes(fakeEditorApi());
        renderAppAt(EDITOR_PATH);
        const inspector = await selectCanvasNode("Dev");

        await userEvent.click(screen.getByRole("button", { name: "Agrupar em map" }));
        within(inspector).getByRole("slider", { name: "Concorrência" }).focus();
        await userEvent.keyboard("{ArrowRight}{ArrowRight}");

        expect(within(inspector).getByRole("textbox", { name: "Rótulo" })).toHaveValue("Map");
        expect(screen.getAllByText("map ×3")).toHaveLength(2);
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

describe("FlowEditorPage validation and publishing", () => {
    it("lists the missing trigger in the problems panel once the trigger is removed", async () => {
        stubFetchRoutes(fakeEditorApi());
        renderAppAt(EDITOR_PATH);
        await selectCanvasNode(TRIGGER_LABEL);

        fireEvent.keyDown(document, { key: "Delete" });

        const problemsPanel = screen.getByRole("region", { name: "Problemas" });
        expect(
            await within(problemsPanel).findByText(NO_TRIGGER_MESSAGE, {}, VALIDATION_WAIT),
        ).toBeInTheDocument();
    });

    it("selects the node of the problem clicked in the panel", async () => {
        stubFetchRoutes(fakeEditorApi({ draftGraph: GRAPH_WITH_EMPTY_PROMPT }));
        renderAppAt(EDITOR_PATH);

        const problemsPanel = await screen.findByRole("region", { name: "Problemas" });

        await userEvent.click(within(problemsPanel).getByText(EMPTY_PROMPT_MESSAGE));

        const inspector = screen.getByRole("complementary", { name: "Inspector" });
        expect(within(inspector).getByRole("textbox", { name: "Rótulo" })).toHaveValue("Dev");
    });

    it("marks the node of a problem as invalid on the canvas", async () => {
        stubFetchRoutes(fakeEditorApi({ draftGraph: GRAPH_WITH_EMPTY_PROMPT }));
        renderAppAt(EDITOR_PATH);

        await screen.findByTestId("rf__wrapper");

        expect(
            within(findCanvasNode("Dev")).getByLabelText("Configuração inválida"),
        ).toBeInTheDocument();
    });

    it("blocks publishing while the draft has errors", async () => {
        stubFetchRoutes(fakeEditorApi({ draftGraph: GRAPH_WITH_EMPTY_PROMPT }));
        renderAppAt(EDITOR_PATH);

        expect(await screen.findByRole("button", { name: "Publicar v1" })).toHaveAttribute(
            "aria-disabled",
            "true",
        );
    });

    it("publishes the draft and shows the new version as the latest", async () => {
        const routes = fakeEditorApi();
        routes[`POST /api/flows/${FLOW_ID}/publish`] = () => {
            routes[`GET ${PROJECT_FLOWS_URL}`] = () =>
                Response.json([{ ...CANONICAL_SUMMARY, latestVersion: 1 }]);
            return Response.json(buildPublishedVersion(1), { status: HTTP_CREATED });
        };
        routes[`GET /api/flows/${FLOW_ID}/versions/1`] = () =>
            Response.json(buildPublishedVersion(1));
        stubFetchRoutes(routes);
        renderAppAt(EDITOR_PATH);

        await userEvent.click(await screen.findByRole("button", { name: "Publicar v1" }));

        expect(
            await screen.findByText("Rascunho · última versão publicada v1"),
        ).toBeInTheDocument();
        expect(screen.getByText("v1 publicada")).toBeInTheDocument();
    });

    it("has nothing to publish when the draft equals the latest version", async () => {
        stubFetchRoutes({
            ...fakeEditorApi({ latestVersion: 3 }),
            [`GET /api/flows/${FLOW_ID}/versions/3`]: () => Response.json(buildPublishedVersion(3)),
        });
        renderAppAt(EDITOR_PATH);

        expect(
            await screen.findByRole("button", { name: "Nada novo para publicar" }),
        ).toHaveAttribute("aria-disabled", "true");
    });

    it("lists the issues the server found when it refused the publish", async () => {
        stubFetchRoutes({
            ...fakeEditorApi(),
            [`POST /api/flows/${FLOW_ID}/publish`]: () =>
                respondWithRefusedPublish([UNKNOWN_TOOL_PROFILE_ISSUE]),
        });
        renderAppAt(EDITOR_PATH);

        await userEvent.click(await screen.findByRole("button", { name: "Publicar v1" }));

        const problemsPanel = screen.getByRole("region", { name: "Problemas" });
        expect(
            await within(problemsPanel).findByText(UNKNOWN_TOOL_PROFILE_ISSUE.message),
        ).toBeInTheDocument();
    });
});

async function selectCanvasNode(label: string): Promise<HTMLElement> {
    await screen.findByTestId("rf__wrapper");

    // A bare click: userEvent's mousedown starts a d3-drag, which needs a real window on the event.
    fireEvent.click(findCanvasNode(label));

    return screen.getByRole("complementary", { name: "Inspector" });
}

function findCanvasNode(label: string): HTMLElement {
    const canvas = screen.getByTestId("rf__wrapper");
    const [nodeCard] = within(canvas).getAllByLabelText(label);
    if (!nodeCard) {
        throw new Error(`Node ${label} is not on the canvas`);
    }

    return nodeCard;
}

async function waitForSavedGraph(fetchSpy: MockInstance<typeof fetch>): Promise<FlowGraph> {
    await waitFor(() => expect(listSentWrites(fetchSpy)).not.toEqual([]), {
        timeout: AUTOSAVE_WAIT_MS,
    });
    const [firstWrite] = listSentWrites(fetchSpy);

    return draftWriteSchema.parse(firstWrite?.body).graph;
}

function findSavedAgentConfig(graph: FlowGraph, nodeId: string): AgentConfig | undefined {
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);

    return node && isNodeOfType(node, "agent") ? node.config : undefined;
}

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
