import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import type { FlowGraph } from "@/shared/flow_graph.js";
import type { FlowDraft } from "@/shared/flow_types.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { listSentWrites, respondWithApiError, stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import type { FakeRoutes } from "@/test/fakes/fake_fetch.js";
import { AUTOSAVE_DELAY_MS, useFlowDraft } from "@/web/canvas/use_flow_draft.js";
import type { FlowDraftEditor } from "@/web/canvas/use_flow_draft.js";

const FLOW_ID = "flw_canonico";
const DRAFT_URL = `/api/flows/${FLOW_ID}/draft`;
const HTTP_CONFLICT = 409;
const HTTP_INTERNAL_SERVER_ERROR = 500;

function buildDraft(revision: number, graph: FlowGraph = buildCanonicalFlow()): FlowDraft {
    return { flowId: FLOW_ID, graph, revision, updatedAt: "2026-11-09T12:00:00Z" };
}

function renameTrigger(graph: FlowGraph): FlowGraph {
    return {
        ...graph,
        nodes: graph.nodes.map((node) =>
            node.id === "trigger" ? { ...node, label: "Toda manhã" } : node,
        ),
    };
}

// Each PUT answers the next revision, like the server does when the expected revision matches.
function fakeDraftApi(): FakeRoutes {
    let revision = 1;

    return {
        [`GET ${DRAFT_URL}`]: () => Response.json(buildDraft(revision)),
        [`PUT ${DRAFT_URL}`]: () => {
            revision += 1;
            return Response.json(buildDraft(revision));
        },
    };
}

function createWrapper(): (props: { children: ReactNode }) => ReactNode {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    return ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
}

async function renderLoadedDraft(clock: FakeClock) {
    const rendered = renderHook(() => useFlowDraft(FLOW_ID, clock), { wrapper: createWrapper() });
    await waitFor(() => expect(rendered.result.current.isLoading).toBe(false));

    return rendered;
}

function editGraph(editor: FlowDraftEditor): void {
    act(() => editor.store.getState().applyGraph(renameTrigger));
}

describe("useFlowDraft", () => {
    it("loads the draft into the editor store", async () => {
        stubFetchRoutes(fakeDraftApi());

        const { result } = await renderLoadedDraft(new FakeClock());

        expect(result.current.store.getState()).toMatchObject({
            flowId: FLOW_ID,
            graph: buildCanonicalFlow(),
            revision: 1,
        });
    });

    it("saves the edited graph after the autosave delay", async () => {
        const fetchSpy = stubFetchRoutes(fakeDraftApi());
        const clock = new FakeClock();
        const { result } = await renderLoadedDraft(clock);
        editGraph(result.current);

        act(() => clock.advance(AUTOSAVE_DELAY_MS));

        await waitFor(() => expect(result.current.store.getState().saveState).toBe("saved"));
        expect(listSentWrites(fetchSpy)).toEqual([
            {
                method: "PUT",
                url: DRAFT_URL,
                body: { graph: renameTrigger(buildCanonicalFlow()), expectedRevision: 1 },
            },
        ]);
        expect(result.current.store.getState()).toMatchObject({ revision: 2, dirty: false });
    });

    it("shows the conflict and stops saving when the revision is stale", async () => {
        const fetchSpy = stubFetchRoutes({
            ...fakeDraftApi(),
            [`PUT ${DRAFT_URL}`]: () => respondWithApiError(HTTP_CONFLICT, "Conflito"),
        });
        const clock = new FakeClock();
        const { result } = await renderLoadedDraft(clock);
        editGraph(result.current);
        act(() => clock.advance(AUTOSAVE_DELAY_MS));
        await waitFor(() => expect(result.current.store.getState().saveState).toBe("conflict"));

        editGraph(result.current);
        act(() => clock.advance(AUTOSAVE_DELAY_MS));

        expect(listSentWrites(fetchSpy)).toHaveLength(1);
    });

    it("marks the save as failed when the server fails", async () => {
        stubFetchRoutes({
            ...fakeDraftApi(),
            [`PUT ${DRAFT_URL}`]: () =>
                respondWithApiError(HTTP_INTERNAL_SERVER_ERROR, "Erro interno do servidor."),
        });
        const clock = new FakeClock();
        const { result } = await renderLoadedDraft(clock);
        editGraph(result.current);

        act(() => clock.advance(AUTOSAVE_DELAY_MS));

        await waitFor(() => expect(result.current.store.getState().saveState).toBe("error"));
    });

    it("reloads the draft from the server", async () => {
        stubFetchRoutes({
            ...fakeDraftApi(),
            [`GET ${DRAFT_URL}`]: () =>
                Response.json(buildDraft(5, renameTrigger(buildCanonicalFlow()))),
        });
        const { result } = await renderLoadedDraft(new FakeClock());
        editGraph(result.current);
        act(() => result.current.store.getState().markConflict());

        act(() => result.current.reload());

        await waitFor(() => expect(result.current.store.getState().revision).toBe(5));
        expect(result.current.store.getState()).toMatchObject({ dirty: false, saveState: "idle" });
    });

    it("saves pending edits right away when the page unloads", async () => {
        const fetchSpy = stubFetchRoutes(fakeDraftApi());
        const { result } = await renderLoadedDraft(new FakeClock());
        editGraph(result.current);

        window.dispatchEvent(new Event("beforeunload"));

        await waitFor(() => expect(listSentWrites(fetchSpy)).toHaveLength(1));
    });

    it("saves pending edits right away when the editor unmounts", async () => {
        const fetchSpy = stubFetchRoutes(fakeDraftApi());
        const { result, unmount } = await renderLoadedDraft(new FakeClock());
        editGraph(result.current);

        unmount();

        await waitFor(() => expect(listSentWrites(fetchSpy)).toHaveLength(1));
    });
});
