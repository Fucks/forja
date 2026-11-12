import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import type { EventEnvelope } from "@/shared/events.js";
import type { SerializedRunView } from "@/shared/run_types.js";
import { apiClient } from "@/web/api/api_client.js";
import type { ApiError } from "@/web/api/api_client.js";
import { useEventStream } from "@/web/api/use_event_stream.js";
import type { CreateEventSource } from "@/web/api/use_event_stream.js";
import { applyEvent } from "@/web/canvas/live/run_view_model.js";

const RUN_VIEW_QUERY_KEY = "run-view";

export interface LiveRun {
    view?: SerializedRunView;
    connected: boolean;
    error?: ApiError;
}

export function useLiveRun(runId: string, createEventSource?: CreateEventSource): LiveRun {
    const queryClient = useQueryClient();
    const [eventsDuringLoads] = useState(() => new EventsDuringLoads());
    const queryKey = runViewQueryKey(runId);
    const query = useQuery<SerializedRunView, ApiError>({
        queryKey,
        queryFn: () => eventsDuringLoads.load(() => fetchRunView(runId)),
    });

    const applyToView = (envelope: EventEnvelope): void => {
        eventsDuringLoads.record(envelope);
        queryClient.setQueryData<SerializedRunView>(
            queryKey,
            (view) => view && applyEvent(view, envelope),
        );
    };
    const { connected } = useEventStream({ runId }, applyToView, createEventSource);

    // A new EventSource cannot send Last-Event-ID, so the events published while the stream was
    // closed are gone from it: each connection reloads the view instead.
    useEffect(() => {
        if (connected) {
            void reloadRunView(queryClient, runId);
        }
    }, [connected, queryClient, runId]);

    return { view: query.data, connected, error: query.error ?? undefined };
}

export function runViewQueryKey(runId: string): string[] {
    return [RUN_VIEW_QUERY_KEY, runId];
}

// A load already on its way may have been answered before the stream subscribed, so it starts over.
async function reloadRunView(queryClient: QueryClient, runId: string): Promise<void> {
    const queryKey = runViewQueryKey(runId);
    await queryClient.cancelQueries({ queryKey });
    await queryClient.invalidateQueries({ queryKey });
}

function fetchRunView(runId: string): Promise<SerializedRunView> {
    return apiClient.get<SerializedRunView>(`/runs/${encodeURIComponent(runId)}`);
}

// The server may build the view before or after an event the stream delivers during the load;
// applying them on top is safe because applyEvent skips what the view already reflects.
class EventsDuringLoads {
    private readonly openLoads = new Set<EventEnvelope[]>();

    record(envelope: EventEnvelope): void {
        for (const receivedEvents of this.openLoads) {
            receivedEvents.push(envelope);
        }
    }

    async load(fetchView: () => Promise<SerializedRunView>): Promise<SerializedRunView> {
        const receivedEvents: EventEnvelope[] = [];
        this.openLoads.add(receivedEvents);
        try {
            const view = await fetchView();
            return receivedEvents.reduce(applyEvent, view);
        } finally {
            this.openLoads.delete(receivedEvents);
        }
    }
}
