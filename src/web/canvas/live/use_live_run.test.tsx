import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import type { EventEnvelope } from "@/shared/events.js";
import { buildSerializedRunView } from "@/test/factories/run_view_factory.js";
import { createFakeEventSourceFactory } from "@/test/fakes/fake_event_source.js";
import type { FakeEventSourceFactory } from "@/test/fakes/fake_event_source.js";
import { respondWithApiError, stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import { createTestQueryClient } from "@/test/render_with_query_client.js";
import { useLiveRun } from "@/web/canvas/live/use_live_run.js";

const RUN_ID = "run-1";
const RUN_URL = `/api/runs/${RUN_ID}`;
const HTTP_NOT_FOUND = 404;
const RECONNECT_DELAY_MS = 1_000;

const RUNNING_ON_DEVELOPER: EventEnvelope = {
    id: 5,
    at: "2026-01-01T12:10:00.000Z",
    event: {
        type: "node_run.updated",
        runId: RUN_ID,
        projectId: "project-1",
        nodeRunId: "node-run-7",
        nodeId: "dev",
        workItemId: "42",
        status: "RUNNING",
        attempt: 1,
        iteration: 0,
    },
};

describe("useLiveRun", () => {
    let eventSources: FakeEventSourceFactory;

    beforeEach(() => {
        eventSources = createFakeEventSourceFactory();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    function renderLiveRun() {
        const queryClient = createTestQueryClient();
        const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        );

        return renderHook(() => useLiveRun(RUN_ID, eventSources.createSource), { wrapper });
    }

    function countRunViewLoads(fetchSpy: ReturnType<typeof stubFetchRoutes>): number {
        return fetchSpy.mock.calls.filter(([url]) => url === RUN_URL).length;
    }

    it("loads the run view", async () => {
        const view = buildSerializedRunView();
        stubFetchRoutes({ [`GET ${RUN_URL}`]: () => Response.json(view) });

        const { result } = renderLiveRun();

        await waitFor(() => expect(result.current.view).toEqual(view));
    });

    it("listens to the events of the run", () => {
        stubFetchRoutes({ [`GET ${RUN_URL}`]: () => Response.json(buildSerializedRunView()) });

        renderLiveRun();

        expect(eventSources.latestSource().url).toBe(`/api/events?runId=${RUN_ID}`);
    });

    it("is connected once the stream opens", async () => {
        stubFetchRoutes({ [`GET ${RUN_URL}`]: () => Response.json(buildSerializedRunView()) });
        const { result } = renderLiveRun();

        act(() => eventSources.latestSource().open());

        await waitFor(() => expect(result.current.connected).toBe(true));
    });

    it("applies each received event to the view", async () => {
        stubFetchRoutes({ [`GET ${RUN_URL}`]: () => Response.json(buildSerializedRunView()) });
        const { result } = renderLiveRun();
        await waitFor(() => expect(result.current.view).toBeDefined());

        act(() => eventSources.latestSource().emit(RUNNING_ON_DEVELOPER));

        await waitFor(() =>
            expect(result.current.view?.nodeRuns.map((nodeRun) => nodeRun.status)).toEqual([
                "RUNNING",
            ]),
        );
    });

    it("reloads the view each time the stream reconnects", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const fetchSpy = stubFetchRoutes({
            [`GET ${RUN_URL}`]: () => Response.json(buildSerializedRunView()),
        });
        renderLiveRun();
        act(() => eventSources.latestSource().open());
        await waitFor(() => expect(countRunViewLoads(fetchSpy)).toBe(2));

        act(() => eventSources.latestSource().fail());
        act(() => {
            vi.advanceTimersByTime(RECONNECT_DELAY_MS);
        });
        act(() => eventSources.latestSource().open());

        await waitFor(() => expect(countRunViewLoads(fetchSpy)).toBe(3));
    });

    it("keeps the events received while the view reloads", async () => {
        let answerReload: (response: Response) => void = () => {};
        const reloadResponse = new Promise<Response>((resolve) => {
            answerReload = resolve;
        });
        let loadCount = 0;
        stubFetchRoutes({
            [`GET ${RUN_URL}`]: () => {
                loadCount += 1;
                return loadCount === 1 ? Response.json(buildSerializedRunView()) : reloadResponse;
            },
        });
        const { result } = renderLiveRun();
        await waitFor(() => expect(result.current.view).toBeDefined());
        act(() => eventSources.latestSource().open());
        await waitFor(() => expect(loadCount).toBe(2));

        act(() => eventSources.latestSource().emit(RUNNING_ON_DEVELOPER));
        answerReload(Response.json(buildSerializedRunView()));

        await waitFor(() => expect(result.current.view?.lastEventId).toBe(RUNNING_ON_DEVELOPER.id));
        expect(result.current.view?.nodeRuns).toHaveLength(1);
    });

    it("reports the error when the run cannot be loaded", async () => {
        stubFetchRoutes({
            [`GET ${RUN_URL}`]: () => respondWithApiError(HTTP_NOT_FOUND, "A run não existe."),
        });

        const { result } = renderLiveRun();

        await waitFor(() => expect(result.current.error?.message).toBe("A run não existe."));
    });
});
