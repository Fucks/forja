import { act, renderHook } from "@testing-library/react";
import type { RenderHookResult } from "@testing-library/react";

import type { EventEnvelope } from "@/shared/events.js";
import { buildRunStartedEvent } from "@/test/factories/forja_event_factory.js";
import { createFakeEventSourceFactory } from "@/test/fakes/fake_event_source.js";
import type { FakeEventSourceFactory } from "@/test/fakes/fake_event_source.js";
import { useEventStream } from "@/web/api/use_event_stream.js";
import type { EventStreamFilter } from "@/web/api/use_event_stream.js";

const envelope: EventEnvelope = {
    id: 7,
    at: "2026-11-07T12:00:00.000Z",
    event: buildRunStartedEvent(),
};

describe("useEventStream", () => {
    let factory: FakeEventSourceFactory;

    beforeEach(() => {
        vi.useFakeTimers();
        factory = createFakeEventSourceFactory();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    function renderEventStream(
        filter: EventStreamFilter = {},
        onEvent: (received: EventEnvelope) => void = vi.fn(),
    ): RenderHookResult<{ connected: boolean }, unknown> {
        return renderHook(() => useEventStream(filter, onEvent, factory.createSource));
    }

    function failLatestSource(): void {
        act(() => factory.latestSource().fail());
    }

    function advanceTime(ms: number): void {
        act(() => {
            vi.advanceTimersByTime(ms);
        });
    }

    it("connects to /api/events with the filter in the query string", () => {
        renderEventStream({ projectId: "project-1", runId: "run-1" });

        expect(factory.latestSource().url).toBe("/api/events?projectId=project-1&runId=run-1");
    });

    it("connects to /api/events without a query string when there is no filter", () => {
        renderEventStream();

        expect(factory.latestSource().url).toBe("/api/events");
    });

    it("delivers each received event envelope to onEvent", () => {
        const onEvent = vi.fn();
        renderEventStream({}, onEvent);

        act(() => factory.latestSource().emit(envelope));

        expect(onEvent).toHaveBeenCalledWith(envelope);
    });

    it("is connected only after the stream opens", () => {
        const { result } = renderEventStream();
        expect(result.current.connected).toBe(false);

        act(() => factory.latestSource().open());

        expect(result.current.connected).toBe(true);
    });

    it("closes the stream and is disconnected after an error", () => {
        const { result } = renderEventStream();
        act(() => factory.latestSource().open());

        failLatestSource();

        expect(result.current.connected).toBe(false);
        expect(factory.latestSource().isClosed).toBe(true);
    });

    it("reconnects after an error with a backoff that doubles up to 30 seconds", () => {
        renderEventStream();
        const expectedDelaysMs = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000];

        expectedDelaysMs.forEach((delayMs, attempt) => {
            failLatestSource();
            advanceTime(delayMs - 1);
            expect(factory.sources).toHaveLength(attempt + 1);

            advanceTime(1);
            expect(factory.sources).toHaveLength(attempt + 2);
        });
    });

    it("restarts the backoff at 1 second once a reconnection opens", () => {
        renderEventStream();
        failLatestSource();
        advanceTime(1_000);
        failLatestSource();
        advanceTime(2_000);
        act(() => factory.latestSource().open());

        failLatestSource();
        advanceTime(1_000);

        expect(factory.sources).toHaveLength(4);
    });

    it("keeps the stream open when the component re-renders with a new onEvent", () => {
        const { rerender } = renderHook(
            ({ onEvent }) => useEventStream({ runId: "run-1" }, onEvent, factory.createSource),
            { initialProps: { onEvent: vi.fn() } },
        );
        const latestOnEvent = vi.fn();

        rerender({ onEvent: latestOnEvent });
        act(() => factory.latestSource().emit(envelope));

        expect(factory.sources).toHaveLength(1);
        expect(latestOnEvent).toHaveBeenCalledWith(envelope);
    });

    it("closes the stream and stops reconnecting on unmount", () => {
        const { unmount } = renderEventStream();
        failLatestSource();

        unmount();
        advanceTime(30_000);

        expect(factory.sources).toHaveLength(1);
        expect(factory.latestSource().isClosed).toBe(true);
    });
});
