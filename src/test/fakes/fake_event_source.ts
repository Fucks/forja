import type { EventEnvelope } from "@/shared/events.js";

export class FakeEventSource extends EventTarget {
    isClosed = false;

    constructor(readonly url: string) {
        super();
    }

    open(): void {
        this.dispatchEvent(new Event("open"));
    }

    fail(): void {
        this.dispatchEvent(new Event("error"));
    }

    emit(envelope: EventEnvelope): void {
        const data = JSON.stringify(envelope);
        const lastEventId = String(envelope.id);
        this.dispatchEvent(new MessageEvent(envelope.event.type, { data, lastEventId }));
    }

    close(): void {
        this.isClosed = true;
    }
}

export interface FakeEventSourceFactory {
    createSource: (url: string) => EventSource;
    sources: FakeEventSource[];
    latestSource: () => FakeEventSource;
}

export function createFakeEventSourceFactory(): FakeEventSourceFactory {
    const sources: FakeEventSource[] = [];

    return {
        sources,
        createSource: (url) => {
            const source = new FakeEventSource(url);
            sources.push(source);
            return asEventSource(source);
        },
        latestSource: () => {
            const source = sources.at(-1);
            if (!source) {
                throw new Error("Nenhum EventSource foi criado.");
            }
            return source;
        },
    };
}

// For screens that open the stream through the browser EventSource instead of an injected factory.
export function captureBrowserEventSources(): FakeEventSourceFactory {
    const factory = createFakeEventSourceFactory();
    vi.stubGlobal("EventSource", function CapturedEventSource(url: string) {
        return factory.createSource(url);
    });

    return factory;
}

// The DOM typing of EventSource.addEventListener has overloads that a plain EventTarget can't
// declare, although it dispatches the same events at runtime.
function asEventSource(source: FakeEventSource): EventSource {
    return source as unknown as EventSource;
}
