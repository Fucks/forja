import { createEventBus, EVENT_BUFFER_CAPACITY } from "@/server/runtime/event_bus.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import type { EventEnvelope } from "@/shared/events.js";
import { buildRunStartedEvent } from "@/test/factories/forja_event_factory.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";

const START = new Date("2026-03-10T12:00:00Z");

describe("createEventBus", () => {
    let clock: FakeClock;
    let bus: EventBus;

    beforeEach(() => {
        clock = new FakeClock(START);
        bus = createEventBus(clock);
    });

    function publishRuns(count: number): void {
        for (let index = 1; index <= count; index++) {
            bus.publish(buildRunStartedEvent({ runId: `run-${index}` }));
        }
    }

    it("wraps each published event in an envelope with an increasing id and the clock time", () => {
        const first = bus.publish(buildRunStartedEvent({ runId: "run-1" }));
        clock.advance(1_000);
        const second = bus.publish(buildRunStartedEvent({ runId: "run-2" }));

        expect(first).toEqual({
            id: 1,
            at: "2026-03-10T12:00:00.000Z",
            event: buildRunStartedEvent({ runId: "run-1" }),
        });
        expect(second.id).toBe(2);
        expect(second.at).toBe("2026-03-10T12:00:01.000Z");
    });

    it("delivers envelopes to subscribers in the order they were published", () => {
        const received: string[] = [];
        bus.subscribe((envelope) => received.push(`a:${envelope.id}`));
        bus.subscribe((envelope) => received.push(`b:${envelope.id}`));

        publishRuns(2);

        expect(received).toEqual(["a:1", "b:1", "a:2", "b:2"]);
    });

    it("stops delivering to a listener once it unsubscribes", () => {
        const listener = vi.fn();
        const unsubscribe = bus.subscribe(listener);
        publishRuns(1);

        unsubscribe();
        publishRuns(1);

        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("keeps delivering to the other listeners when one of them throws", () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const received: EventEnvelope[] = [];
        bus.subscribe(() => {
            throw new Error("assinante quebrado");
        });
        bus.subscribe((envelope) => received.push(envelope));

        const published = bus.publish(buildRunStartedEvent());

        expect(received).toEqual([published]);
        expect(console.error).toHaveBeenCalledOnce();
    });

    it("returns the buffered envelopes published after the given id", () => {
        publishRuns(4);

        const replayed = bus.since(2);

        expect(replayed.map((envelope) => envelope.id)).toEqual([3, 4]);
    });

    it("returns every buffered envelope since id 0", () => {
        publishRuns(3);

        expect(bus.since(0).map((envelope) => envelope.id)).toEqual([1, 2, 3]);
    });

    it("discards the oldest envelope when the buffer is over capacity", () => {
        publishRuns(EVENT_BUFFER_CAPACITY + 1);

        const buffered = bus.since(0);

        expect(EVENT_BUFFER_CAPACITY).toBe(5000);
        expect(buffered).toHaveLength(EVENT_BUFFER_CAPACITY);
        expect(buffered[0]?.id).toBe(2);
        expect(buffered.at(-1)?.id).toBe(EVENT_BUFFER_CAPACITY + 1);
    });
});
