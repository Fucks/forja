import { act, renderHook, waitFor } from "@testing-library/react";

import type { EventEnvelope } from "@/shared/events.js";
import type { LogPage, StoredLogEvent } from "@/shared/log_types.js";
import { buildStoredLogEvents } from "@/test/factories/stored_log_event_factory.js";
import { createFakeEventSourceFactory } from "@/test/fakes/fake_event_source.js";
import type { FakeEventSourceFactory } from "@/test/fakes/fake_event_source.js";
import { respondWithApiError, stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import { useNodeRunLogs } from "@/web/logs/use_node_run_logs.js";

const RUN_ID = "run-1";
const NODE_RUN_ID = "node-run-1";
const LOGS_URL = `/api/node-runs/${NODE_RUN_ID}/logs`;
const PAGE_SIZE = 2_000;
const HTTP_NOT_FOUND = 404;

describe("useNodeRunLogs", () => {
    let eventSources: FakeEventSourceFactory;

    beforeEach(() => {
        eventSources = createFakeEventSourceFactory();
    });

    function renderNodeRunLogs() {
        return renderHook(() => useNodeRunLogs(NODE_RUN_ID, RUN_ID, eventSources.createSource));
    }

    it("loads the whole history in pages of 2 000 events", async () => {
        const fetchSpy = stubLogStore(buildStoredLogEvents(1, 2_500));

        const { result } = renderNodeRunLogs();

        await waitFor(() => expect(result.current.complete).toBe(true));
        expect(result.current.lines.map((line) => line.seq)).toEqual(sequence(1, 2_500));
        expect(requestedPages(fetchSpy)).toEqual([
            { fromSeq: "1", limit: String(PAGE_SIZE) },
            { fromSeq: "2001", limit: String(PAGE_SIZE) },
        ]);
    });

    it("is loading until the first page arrives", async () => {
        stubLogStore(buildStoredLogEvents(1, 3));

        const { result } = renderNodeRunLogs();

        expect(result.current.loading).toBe(true);
        await waitFor(() => expect(result.current.loading).toBe(false));
    });

    it("listens to the events of the run", () => {
        stubLogStore([]);

        renderNodeRunLogs();

        expect(eventSources.latestSource().url).toBe(`/api/events?runId=${RUN_ID}`);
    });

    it("fetches the new range of events each time the NodeRun log grows", async () => {
        const storedEvents = buildStoredLogEvents(1, 3);
        const fetchSpy = stubLogStore(storedEvents);
        const { result } = renderNodeRunLogs();
        await waitFor(() => expect(result.current.complete).toBe(true));

        storedEvents.push(...buildStoredLogEvents(4, 5));
        act(() => eventSources.latestSource().emit(logAppended(NODE_RUN_ID, 4, 5)));

        await waitFor(() =>
            expect(result.current.lines.map((line) => line.seq)).toEqual([1, 2, 3, 4, 5]),
        );
        expect(requestedPages(fetchSpy).at(-1)?.fromSeq).toBe("4");
    });

    it("fetches what was appended while the stream was closed once it connects", async () => {
        const storedEvents = buildStoredLogEvents(1, 3);
        const fetchSpy = stubLogStore(storedEvents);
        const { result } = renderNodeRunLogs();
        await waitFor(() => expect(result.current.complete).toBe(true));

        storedEvents.push(...buildStoredLogEvents(4, 5));
        act(() => eventSources.latestSource().open());

        await waitFor(() => expect(result.current.lines).toHaveLength(5));
        expect(requestedPages(fetchSpy).at(-1)?.fromSeq).toBe("4");
    });

    it("ignores the log growth of other NodeRuns", async () => {
        const fetchSpy = stubLogStore(buildStoredLogEvents(1, 3));
        const { result } = renderNodeRunLogs();
        await waitFor(() => expect(result.current.complete).toBe(true));

        act(() => eventSources.latestSource().emit(logAppended("node-run-2", 1, 2)));

        expect(requestedPages(fetchSpy)).toHaveLength(1);
    });

    it("shows each event once when a range overlaps what is already loaded", async () => {
        const storedEvents = buildStoredLogEvents(1, 3);
        stubLogStore(storedEvents);
        const { result } = renderNodeRunLogs();
        await waitFor(() => expect(result.current.complete).toBe(true));

        storedEvents.push(...buildStoredLogEvents(4, 4));
        act(() => eventSources.latestSource().emit(logAppended(NODE_RUN_ID, 2, 4)));

        await waitFor(() => expect(result.current.lines).toHaveLength(4));
        expect(result.current.lines.map((line) => line.seq)).toEqual([1, 2, 3, 4]);
    });

    it("reports the error when the logs cannot be loaded", async () => {
        stubFetchRoutes({
            [`GET ${LOGS_URL}?fromSeq=1&limit=${PAGE_SIZE}`]: () =>
                respondWithApiError(HTTP_NOT_FOUND, "O NodeRun não existe."),
        });

        const { result } = renderNodeRunLogs();

        await waitFor(() => expect(result.current.error?.message).toBe("O NodeRun não existe."));
        expect(result.current.loading).toBe(false);
    });
});

// Answers like the server: the page starts at fromSeq and holds up to limit events.
function stubLogStore(storedEvents: StoredLogEvent[]): ReturnType<typeof stubFetchRoutes> {
    return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
        const url = toRequestUrl(input);
        if (url.pathname !== LOGS_URL) {
            return Promise.resolve(respondWithApiError(HTTP_NOT_FOUND, "Rota não encontrada."));
        }

        return Promise.resolve(Response.json(readPage(storedEvents, url.searchParams)));
    });
}

function readPage(storedEvents: StoredLogEvent[], query: URLSearchParams): LogPage {
    const fromSeq = Number(query.get("fromSeq"));
    const limit = Number(query.get("limit"));
    const events = storedEvents.filter((event) => event.seq >= fromSeq).slice(0, limit);
    const nextSeq = (events.at(-1)?.seq ?? fromSeq - 1) + 1;

    return { events, nextSeq, total: storedEvents.length };
}

function requestedPages(
    fetchSpy: ReturnType<typeof stubFetchRoutes>,
): { fromSeq: string | null; limit: string | null }[] {
    return fetchSpy.mock.calls.map(([input]) => {
        const query = toRequestUrl(input).searchParams;
        return { fromSeq: query.get("fromSeq"), limit: query.get("limit") };
    });
}

function toRequestUrl(input: Parameters<typeof fetch>[0]): URL {
    if (input instanceof Request) {
        return new URL(input.url);
    }

    return new URL(input, window.location.origin);
}

function logAppended(nodeRunId: string, fromSeq: number, toSeq: number): EventEnvelope {
    return {
        id: toSeq,
        at: "2026-01-01T12:10:00.000Z",
        event: {
            type: "log.appended",
            runId: RUN_ID,
            projectId: "project-1",
            nodeRunId,
            fromSeq,
            toSeq,
        },
    };
}

function sequence(from: number, to: number): number[] {
    return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}
