import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";

import { createEventsRoutes } from "@/server/events/events_routes.js";
import { createEventBus } from "@/server/runtime/event_bus.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import { buildRunStartedEvent } from "@/test/factories/forja_event_factory.js";
import { EventStreamClient } from "@/test/event_stream_client.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";

const TEST_HEARTBEAT_INTERVAL_MS = 20;
const EPHEMERAL_PORT = 0;
const LOCALHOST = "127.0.0.1";

describe("GET /events", () => {
    let bus: EventBus;
    let app: FastifyInstance;
    let baseUrl: string;
    let openStreams: EventStreamClient[];

    beforeEach(async () => {
        bus = createEventBus(new FakeClock());
        app = Fastify();
        app.setValidatorCompiler(validatorCompiler);
        app.setSerializerCompiler(serializerCompiler);
        await app.register((scope) =>
            createEventsRoutes({ heartbeatIntervalMs: TEST_HEARTBEAT_INTERVAL_MS })(scope, {
                events: bus,
            }),
        );
        baseUrl = await app.listen({ host: LOCALHOST, port: EPHEMERAL_PORT });
        openStreams = [];
    });

    afterEach(async () => {
        for (const stream of openStreams) {
            stream.close();
        }
        await app.close();
    });

    async function connect(
        query = "",
        headers: Record<string, string> = {},
    ): Promise<EventStreamClient> {
        const stream = await EventStreamClient.open(`${baseUrl}/events${query}`, headers);
        openStreams.push(stream);
        return stream;
    }

    it("streams each published envelope with its id, type and JSON data", async () => {
        const stream = await connect();

        const published = bus.publish(buildRunStartedEvent());
        const [received] = await stream.nextEvents(1);

        expect(stream.contentType).toContain("text/event-stream");
        expect(received).toEqual({ id: published.id, event: "run.started", data: published });
    });

    it("replays the buffered envelopes after the Last-Event-ID before the live ones", async () => {
        for (let index = 1; index <= 12; index++) {
            bus.publish(buildRunStartedEvent({ runId: `run-${index}` }));
        }
        const stream = await connect("", { "last-event-id": "10" });

        bus.publish(buildRunStartedEvent({ runId: "run-13" }));
        const received = await stream.nextEvents(3);

        expect(received.map((event) => event.id)).toEqual([11, 12, 13]);
    });

    it("sends only live envelopes when the client has no Last-Event-ID", async () => {
        bus.publish(buildRunStartedEvent({ runId: "run-old" }));
        const stream = await connect();

        bus.publish(buildRunStartedEvent({ runId: "run-new" }));
        const [received] = await stream.nextEvents(1);

        expect(received?.id).toBe(2);
    });

    it("delivers only the envelopes of the requested run", async () => {
        const stream = await connect("?runId=run-2");

        bus.publish(buildRunStartedEvent({ runId: "run-1" }));
        bus.publish({ type: "usage.limit_reset", projectId: "project-1" });
        bus.publish(buildRunStartedEvent({ runId: "run-2" }));
        const received = await stream.nextEvents(1);

        expect(received.map((event) => event.id)).toEqual([3]);
    });

    it("delivers only the envelopes of the requested project", async () => {
        const stream = await connect("?projectId=project-2");

        bus.publish(buildRunStartedEvent({ projectId: "project-1" }));
        bus.publish({ type: "usage.limit_reset", projectId: "project-2" });
        const received = await stream.nextEvents(1);

        expect(received.map((event) => event.data.event.type)).toEqual(["usage.limit_reset"]);
    });

    it("applies the filters to the replayed envelopes too", async () => {
        bus.publish(buildRunStartedEvent({ runId: "run-1" }));
        bus.publish(buildRunStartedEvent({ runId: "run-2" }));
        const stream = await connect("?runId=run-2", { "last-event-id": "0" });

        const received = await stream.nextEvents(1);

        expect(received.map((event) => event.id)).toEqual([2]);
    });

    it("sends a ping comment on every heartbeat interval", async () => {
        const stream = await connect();

        await stream.waitForText(": ping\n\n");

        expect(stream.text).toContain(": ping\n\n");
    });

    it("ends the open streams when the server closes", async () => {
        const stream = await connect();

        await app.close();

        await expect(stream.waitForEnd()).resolves.toBeUndefined();
    });

    it("removes its listener from the bus when the client disconnects", async () => {
        const unsubscribe = spyOnUnsubscribe(bus);
        const stream = await connect();

        stream.close();

        await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce());
    });
});

function spyOnUnsubscribe(bus: EventBus): ReturnType<typeof vi.fn> {
    const unsubscribe = vi.fn();
    const subscribe = bus.subscribe.bind(bus);
    vi.spyOn(bus, "subscribe").mockImplementation((listener) => {
        const stopListening = subscribe(listener);
        return () => {
            unsubscribe();
            stopListening();
        };
    });
    return unsubscribe;
}
