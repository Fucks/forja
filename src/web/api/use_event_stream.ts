import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import type { EventEnvelope, ForjaEventType } from "@/shared/events.js";

const EVENTS_URL = "/api/events";
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const RECONNECT_DELAY_MULTIPLIER = 2;

// The server names each SSE frame after its event type, and EventSource only delivers a named
// frame to listeners registered for that name. Typed as a Record so a new event type breaks the
// build until it is listed here.
const STREAMED_EVENT_TYPES: Record<ForjaEventType, true> = {
    "run.created": true,
    "run.started": true,
    "run.finished": true,
    "run.paused": true,
    "run.resumed": true,
    "node_run.updated": true,
    "group.progress": true,
    "log.appended": true,
    "usage.recorded": true,
    "usage.limit_reached": true,
    "usage.limit_reset": true,
    "work_item.created": true,
    "work_item.updated": true,
    "approval.requested": true,
    "approval.resolved": true,
    "trigger.fired": true,
    "flow.published": true,
};

export interface EventStreamFilter {
    projectId?: string;
    runId?: string;
}

type CreateEventSource = (url: string) => EventSource;
type EventEnvelopeListener = (envelope: EventEnvelope) => void;

export function useEventStream(
    filter: EventStreamFilter,
    onEvent: EventEnvelopeListener,
    createSource: CreateEventSource = openBrowserEventSource,
): { connected: boolean } {
    const [connected, setConnected] = useState(false);
    const latestCallbacks = useLatest({ onEvent, createSource });
    const url = buildEventStreamUrl(filter);

    useEffect(() => {
        const stream = new ReconnectingEventStream({
            url,
            createSource: (streamUrl) => latestCallbacks.current.createSource(streamUrl),
            onEvent: (envelope) => latestCallbacks.current.onEvent(envelope),
            onConnectionChange: setConnected,
        });
        stream.connect();

        return () => stream.close();
    }, [url, latestCallbacks]);

    return { connected };
}

function openBrowserEventSource(url: string): EventSource {
    return new EventSource(url);
}

// Callers usually pass inline callbacks; reading them through a ref keeps the stream open across
// renders instead of reconnecting every time.
function useLatest<T>(value: T): RefObject<T> {
    const ref = useRef(value);
    useEffect(() => {
        ref.current = value;
    });
    return ref;
}

function buildEventStreamUrl(filter: EventStreamFilter): string {
    const query = new URLSearchParams();
    if (filter.projectId !== undefined) {
        query.set("projectId", filter.projectId);
    }
    if (filter.runId !== undefined) {
        query.set("runId", filter.runId);
    }

    const queryString = query.toString();
    return queryString === "" ? EVENTS_URL : `${EVENTS_URL}?${queryString}`;
}

interface ReconnectingEventStreamOptions {
    url: string;
    createSource: CreateEventSource;
    onEvent: EventEnvelopeListener;
    onConnectionChange: (connected: boolean) => void;
}

class ReconnectingEventStream {
    private source: EventSource | undefined;
    private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    private reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;

    constructor(private readonly options: ReconnectingEventStreamOptions) {}

    connect(): void {
        const source = this.options.createSource(this.options.url);
        source.addEventListener("open", () => this.markConnected());
        source.addEventListener("error", () => this.reconnectLater(source));
        listenToForjaEvents(source, this.options.onEvent);
        this.source = source;
    }

    close(): void {
        clearTimeout(this.reconnectTimer);
        this.source?.close();
        this.options.onConnectionChange(false);
    }

    private markConnected(): void {
        this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
        this.options.onConnectionChange(true);
    }

    // EventSource retries by itself at a fixed pace and gives up on HTTP errors; closing it puts
    // every retry under this backoff instead.
    private reconnectLater(source: EventSource): void {
        source.close();
        this.options.onConnectionChange(false);
        this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelayMs);
        this.reconnectDelayMs = Math.min(
            this.reconnectDelayMs * RECONNECT_DELAY_MULTIPLIER,
            MAX_RECONNECT_DELAY_MS,
        );
    }
}

function listenToForjaEvents(source: EventSource, onEvent: EventEnvelopeListener): void {
    for (const eventType of Object.keys(STREAMED_EVENT_TYPES)) {
        source.addEventListener(eventType, (message: MessageEvent<string>) => {
            onEvent(parseEnvelope(message.data));
        });
    }
}

// The stream only carries EventEnvelope values serialized by our own server.
function parseEnvelope(json: string): EventEnvelope {
    return JSON.parse(json) as EventEnvelope;
}
