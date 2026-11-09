import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { systemClock } from "@/lib/clock.js";
import type { Clock } from "@/lib/clock.js";
import type { FlowDraft } from "@/shared/flow_types.js";
import { apiClient } from "@/web/api/api_client.js";
import type { ApiError } from "@/web/api/api_client.js";
import { createAutosave } from "@/web/canvas/autosave.js";
import type { AutosaveOptions } from "@/web/canvas/autosave.js";
import { createEditorStore } from "@/web/canvas/editor_store.js";
import type { EditorState, EditorStore } from "@/web/canvas/editor_store.js";

export const AUTOSAVE_DELAY_MS = 800;

const FLOW_DRAFT_QUERY_KEY = "flow-draft";

// Once loaded, the draft belongs to the editor: a refetch nobody asked for would discard the
// unsaved edits, and a cached draft would reopen the editor on an old revision.
const EDITOR_OWNED_QUERY_OPTIONS = { staleTime: Infinity, gcTime: 0 } as const;

export interface FlowDraftEditor {
    store: EditorStore;
    isLoading: boolean;
    loadError: ApiError | null;
    reload(): void;
}

export function useFlowDraft(flowId: string, clock: Clock = systemClock): FlowDraftEditor {
    const [store] = useState(createEditorStore);
    const draftQuery = useQuery<FlowDraft, ApiError>({
        queryKey: [FLOW_DRAFT_QUERY_KEY, flowId],
        queryFn: () => loadDraftIntoStore(flowId, store),
        ...EDITOR_OWNED_QUERY_OPTIONS,
    });
    useDraftAutosave({ flowId, store, clock });

    return {
        store,
        isLoading: draftQuery.isPending,
        loadError: draftQuery.error,
        reload: () => void draftQuery.refetch(),
    };
}

async function loadDraftIntoStore(flowId: string, store: EditorStore): Promise<FlowDraft> {
    const draft = await apiClient.get<FlowDraft>(draftPath(flowId));
    store.getState().load(draft);

    return draft;
}

function useDraftAutosave({
    flowId,
    store,
    clock,
}: {
    flowId: string;
    store: EditorStore;
    clock: Clock;
}): void {
    useEffect(() => {
        const autosave = createAutosave({
            delayMs: AUTOSAVE_DELAY_MS,
            save: createDraftSaver(flowId, store),
            onConflict: () => store.getState().markConflict(),
            onError: () => store.getState().markSaveFailed(),
            setTimer: (fire, delayMs) => clock.setTimeout(fire, delayMs),
        });
        const stopWatchingEdits = store.subscribe((state, previous) => {
            if (isAutosavableEdit(state, previous)) {
                autosave.schedule(state.graph, state.revision);
            }
        });
        const flushPendingEdits = (): void => void autosave.flush();
        window.addEventListener("beforeunload", flushPendingEdits);

        return () => {
            stopWatchingEdits();
            window.removeEventListener("beforeunload", flushPendingEdits);
            flushPendingEdits();
        };
    }, [flowId, store, clock]);
}

function createDraftSaver(flowId: string, store: EditorStore): AutosaveOptions["save"] {
    return async (graph, revision) => {
        store.getState().markSaving();
        const draft = await apiClient.put<FlowDraft>(draftPath(flowId), {
            graph,
            expectedRevision: revision,
        });
        store.getState().markSaved(draft.revision);

        return draft.revision;
    };
}

// After a conflict nothing is saved until the user reloads the draft, so the other tab's changes
// are never overwritten.
function isAutosavableEdit(state: EditorState, previous: EditorState): boolean {
    return state.dirty && state.graph !== previous.graph && state.saveState !== "conflict";
}

function draftPath(flowId: string): string {
    return `/flows/${encodeURIComponent(flowId)}/draft`;
}
