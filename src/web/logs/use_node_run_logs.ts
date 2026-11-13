import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { EventEnvelope } from "@/shared/events.js";
import { FIRST_LOG_SEQ, LOGS_EXPIRED_MESSAGE } from "@/shared/log_types.js";
import type { LogPage, StoredLogEvent } from "@/shared/log_types.js";
import { apiClient, ApiError } from "@/web/api/api_client.js";
import { useEventStream } from "@/web/api/use_event_stream.js";
import type { CreateEventSource } from "@/web/api/use_event_stream.js";
import type { LogLine } from "@/web/logs/log_types.js";
import { toLogLines } from "@/web/logs/to_log_lines.js";

const LOG_PAGE_SIZE = 2_000;
const HTTP_GONE = 410;

export interface NodeRunLogs {
    lines: LogLine[];
    loading: boolean;
    complete: boolean;
    error?: ApiError;
}

type AppendEvents = (events: StoredLogEvent[]) => void;
type ReportError = (error: ApiError) => void;

export function useNodeRunLogs(
    nodeRunId: string,
    runId: string,
    createEventSource?: CreateEventSource,
): NodeRunLogs {
    const [error, setError] = useState<ApiError>();
    const { events, appendEvents } = useLogEvents();
    const complete = useLogHistory({ nodeRunId, appendEvents, reportError: setError });
    useLogUpdates({
        nodeRunId,
        runId,
        isHistoryComplete: complete,
        nextSeq: nextSeqAfter(events),
        appendEvents,
        reportError: setError,
        createEventSource,
    });
    const lines = useMemo(() => toLogLinesFromFirstEvent(events), [events]);

    const loading = !complete && error === undefined && events.length === 0;
    return { lines, loading, complete, error };
}

function useLogEvents(): { events: StoredLogEvent[]; appendEvents: AppendEvents } {
    const [events, setEvents] = useState<StoredLogEvent[]>([]);
    const appendEvents = useCallback((incoming: StoredLogEvent[]) => {
        setEvents((current) => mergeBySeq(current, incoming));
    }, []);

    return { events, appendEvents };
}

function useLogHistory({
    nodeRunId,
    appendEvents,
    reportError,
}: {
    nodeRunId: string;
    appendEvents: AppendEvents;
    reportError: ReportError;
}): boolean {
    const [complete, setComplete] = useState(false);

    useEffect(() => {
        let isCurrentNodeRun = true;

        async function loadHistory(): Promise<void> {
            await loadPagesFrom(nodeRunId, FIRST_LOG_SEQ, (events) => {
                if (isCurrentNodeRun) {
                    appendEvents(events);
                }
            });
            if (isCurrentNodeRun) {
                setComplete(true);
            }
        }

        void reportApiError(loadHistory(), reportError);
        return () => {
            isCurrentNodeRun = false;
        };
    }, [nodeRunId, appendEvents, reportError]);

    return complete;
}

function useLogUpdates({
    nodeRunId,
    runId,
    isHistoryComplete,
    nextSeq,
    appendEvents,
    reportError,
    createEventSource,
}: {
    nodeRunId: string;
    runId: string;
    isHistoryComplete: boolean;
    nextSeq: number;
    appendEvents: AppendEvents;
    reportError: ReportError;
    createEventSource: CreateEventSource | undefined;
}): void {
    const nextSeqRef = useRef(nextSeq);
    useEffect(() => {
        nextSeqRef.current = nextSeq;
    }, [nextSeq]);

    function loadNewRange(envelope: EventEnvelope): void {
        const { event } = envelope;
        if (event.type !== "log.appended" || event.nodeRunId !== nodeRunId) {
            return;
        }

        void reportApiError(loadPagesFrom(nodeRunId, event.fromSeq, appendEvents), reportError);
    }

    const { connected } = useEventStream({ runId }, loadNewRange, createEventSource);

    // A new EventSource cannot send Last-Event-ID, so the appends announced while the stream was
    // closed are gone from it: each connection fetches what came after the last known event.
    useEffect(() => {
        if (!connected || !isHistoryComplete) {
            return;
        }

        void reportApiError(
            loadPagesFrom(nodeRunId, nextSeqRef.current, appendEvents),
            reportError,
        );
    }, [connected, isHistoryComplete, nodeRunId, appendEvents, reportError]);
}

async function loadPagesFrom(
    nodeRunId: string,
    fromSeq: number,
    appendEvents: AppendEvents,
): Promise<void> {
    let nextSeq = fromSeq;
    let hasMoreEvents = true;
    while (hasMoreEvents) {
        const page = await fetchLogPage(nodeRunId, nextSeq);
        appendEvents(page.events);
        hasMoreEvents = page.events.length === LOG_PAGE_SIZE;
        nextSeq = page.nextSeq;
    }
}

function fetchLogPage(nodeRunId: string, fromSeq: number): Promise<LogPage> {
    const query = new URLSearchParams({ fromSeq: String(fromSeq), limit: String(LOG_PAGE_SIZE) });
    return apiClient.get<LogPage>(`/node-runs/${encodeURIComponent(nodeRunId)}/logs?${query}`);
}

async function reportApiError(pendingLoad: Promise<void>, reportError: ReportError): Promise<void> {
    try {
        await pendingLoad;
    } catch (error) {
        if (!(error instanceof ApiError)) {
            throw error;
        }
        reportError(explainExpiredLogs(error));
    }
}

function explainExpiredLogs(error: ApiError): ApiError {
    if (error.status !== HTTP_GONE) {
        return error;
    }

    return new ApiError({ status: error.status, code: error.code, message: LOGS_EXPIRED_MESSAGE });
}

// A range announced by log.appended may overlap the pages already loaded.
function mergeBySeq(current: StoredLogEvent[], incoming: StoredLogEvent[]): StoredLogEvent[] {
    const eventsBySeq = new Map(current.map((event) => [event.seq, event]));
    for (const event of incoming) {
        eventsBySeq.set(event.seq, event);
    }

    return [...eventsBySeq.values()].sort((a, b) => a.seq - b.seq);
}

function nextSeqAfter(events: StoredLogEvent[]): number {
    const lastEvent = events.at(-1);
    if (!lastEvent) {
        return FIRST_LOG_SEQ;
    }

    return lastEvent.seq + 1;
}

// The offsets count from the first event: a NodeRun starts logging as soon as it starts.
function toLogLinesFromFirstEvent(events: StoredLogEvent[]): LogLine[] {
    const firstEvent = events[0];
    if (!firstEvent) {
        return [];
    }

    return toLogLines(events, new Date(firstEvent.at));
}
