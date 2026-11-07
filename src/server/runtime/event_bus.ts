import type { ForjaEvent, EventEnvelope } from "@/shared/events.js";

export const EVENT_BUFFER_CAPACITY = 5000;

type EventListener = (envelope: EventEnvelope) => void;
type Unsubscribe = () => void;

export interface EventBus {
    publish(event: ForjaEvent): EventEnvelope;
    subscribe(listener: EventListener): Unsubscribe;
    since(lastId: number): EventEnvelope[];
}

export function createEventBus(clock: { now(): Date }): EventBus {
    return new InMemoryEventBus(clock);
}

class InMemoryEventBus implements EventBus {
    private readonly listeners = new Set<EventListener>();
    private readonly recentEnvelopes: EventEnvelope[] = [];
    private lastPublishedId = 0;

    constructor(private readonly clock: { now(): Date }) {}

    publish(event: ForjaEvent): EventEnvelope {
        this.lastPublishedId += 1;
        const envelope = { id: this.lastPublishedId, at: this.clock.now().toISOString(), event };
        this.remember(envelope);
        this.notifyListeners(envelope);
        return envelope;
    }

    subscribe(listener: EventListener): Unsubscribe {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    since(lastId: number): EventEnvelope[] {
        return this.recentEnvelopes.filter((envelope) => envelope.id > lastId);
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
function notifyListener(listener: EventListener, envelope: EventEnvelope): void {
    try {
        listener(envelope);
    } catch (error) {
        console.error(`Falha em um assinante do evento ${envelope.event.type}`, error);
    }
}
