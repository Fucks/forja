import type { ForjaEvent, EventEnvelope } from "@/shared/events.js";

export const EVENT_BUFFER_CAPACITY = 5000;

type EnvelopeListener = (envelope: EventEnvelope) => void;
type Unsubscribe = () => void;
type TimeSource = { now(): Date };

export interface EventBus {
    publish(event: ForjaEvent): EventEnvelope;
    subscribe(listener: EnvelopeListener): Unsubscribe;
    since(lastId: number): EventEnvelope[];
    lastEventId(): number;
}

export function createEventBus(clock: TimeSource): EventBus {
    return new InMemoryEventBus(clock);
}

class InMemoryEventBus implements EventBus {
    private readonly listeners = new Set<EnvelopeListener>();
    private readonly recentEnvelopes: EventEnvelope[] = [];
    private lastPublishedId = 0;

    constructor(private readonly clock: TimeSource) {}

    publish(event: ForjaEvent): EventEnvelope {
        this.lastPublishedId += 1;
        const envelope = { id: this.lastPublishedId, at: this.clock.now().toISOString(), event };
        this.remember(envelope);
        this.notifyListeners(envelope);
        return envelope;
    }

    subscribe(listener: EnvelopeListener): Unsubscribe {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    since(lastId: number): EventEnvelope[] {
        return this.recentEnvelopes.filter((envelope) => envelope.id > lastId);
    }

    lastEventId(): number {
        return this.lastPublishedId;
    }

    private remember(envelope: EventEnvelope): void {
        this.recentEnvelopes.push(envelope);
        if (this.recentEnvelopes.length > EVENT_BUFFER_CAPACITY) {
            this.recentEnvelopes.shift();
        }
    }

    private notifyListeners(envelope: EventEnvelope): void {
        for (const listener of this.listeners) {
            notifyListener(listener, envelope);
        }
    }
}

// One broken subscriber (e.g. a closed SSE socket) must not keep the others from seeing the event.
function notifyListener(listener: EnvelopeListener, envelope: EventEnvelope): void {
    try {
        listener(envelope);
    } catch (error) {
        console.error(`Falha em um assinante do evento ${envelope.event.type}`, error);
    }
}
