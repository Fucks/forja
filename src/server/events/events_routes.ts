import type { ServerResponse } from "node:http";

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import type { AppDeps } from "@/server/app.js";
import type { RouteModule } from "@/server/route_modules.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import type { EventEnvelope, ForjaEvent } from "@/shared/events.js";

const EVENTS_PATH = "/events";
const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_COMMENT = ": ping\n\n";
const HTTP_OK = 200;
const EVENT_STREAM_HEADERS = {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
};

const eventFilterSchema = z.object({
    projectId: z.string().min(1).optional(),
    runId: z.string().min(1).optional(),
});

type EventFilter = z.infer<typeof eventFilterSchema>;

const lastEventIdSchema = z
    .string()
    .regex(/^\d+$/)
    .transform((lastEventId) => Number(lastEventId));

export interface EventsRoutesOptions {
    heartbeatIntervalMs: number;
}

type EventsRouteModule = (app: FastifyInstance, deps: Pick<AppDeps, "events">) => void;
type EndStream = () => void;

export function createEventsRoutes(options: EventsRoutesOptions): EventsRouteModule {
    return (app, deps) => {
        const openStreams = new Set<EndStream>();
        app.addHook("preClose", (done) => {
            openStreams.forEach((endStream) => endStream());
            done();
        });

        app.withTypeProvider<ZodTypeProvider>().get(
            EVENTS_PATH,
            { schema: { querystring: eventFilterSchema } },
            (request, reply) => {
                reply.hijack();
                const endStream = streamEvents({
                    response: reply.raw,
                    events: deps.events,
                    filter: request.query,
                    lastEventId: parseLastEventId(request.headers["last-event-id"]),
                    heartbeatIntervalMs: options.heartbeatIntervalMs,
                });
                openStreams.add(endStream);
                reply.raw.on("close", () => openStreams.delete(endStream));
            },
        );
    };
}

export const registerEventsRoutes: RouteModule = createEventsRoutes({
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
});

interface EventStream {
    response: ServerResponse;
    events: EventBus;
    filter: EventFilter;
    lastEventId: number | undefined;
    heartbeatIntervalMs: number;
}

function streamEvents(stream: EventStream): EndStream {
    const { response, events, filter, lastEventId, heartbeatIntervalMs } = stream;
    openEventStream(response);

    const sendIfMatching = (envelope: EventEnvelope): void => {
        if (matchesFilter(envelope.event, filter)) {
            response.write(formatServerSentEvent(envelope));
        }
    };

    // Replay and subscribe run in the same tick, so no event published in between is lost.
    if (lastEventId !== undefined) {
        events.since(lastEventId).forEach(sendIfMatching);
    }
    const unsubscribe = events.subscribe(sendIfMatching);
    const stopHeartbeat = startHeartbeat(response, heartbeatIntervalMs);

    const stopWriting = (): void => {
        stopHeartbeat();
        unsubscribe();
    };
    response.on("close", stopWriting);

    return () => {
        stopWriting();
        response.end();
    };
}

export function openEventStream(response: ServerResponse): void {
    response.writeHead(HTTP_OK, EVENT_STREAM_HEADERS);
    response.flushHeaders();
}

function parseLastEventId(header: string | string[] | undefined): number | undefined {
    const parsed = lastEventIdSchema.safeParse(header);
    return parsed.success ? parsed.data : undefined;
}

function matchesFilter(event: ForjaEvent, filter: EventFilter): boolean {
    if (filter.projectId !== undefined && event.projectId !== filter.projectId) {
        return false;
    }
    if (filter.runId !== undefined && findRunId(event) !== filter.runId) {
        return false;
    }
    return true;
}

function findRunId(event: ForjaEvent): string | undefined {
    return "runId" in event ? event.runId : undefined;
}

function formatServerSentEvent(envelope: EventEnvelope): string {
    return `id: ${envelope.id}\nevent: ${envelope.event.type}\ndata: ${JSON.stringify(envelope)}\n\n`;
}

function startHeartbeat(response: ServerResponse, intervalMs: number): () => void {
    const heartbeat = setInterval(() => response.write(HEARTBEAT_COMMENT), intervalMs);
    return () => clearInterval(heartbeat);
}
