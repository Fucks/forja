import { createContext, use, useEffect, useRef } from "react";
import type { RefObject } from "react";
import { create } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";

/** A field of a node or group to focus in the inspector, such as the prompt of the agent `dev`. */
export interface FieldFocusRequest {
    targetId: string;
    fieldKey: string;
}

interface FieldFocusState {
    pendingRequest: FieldFocusRequest | undefined;
    requestFocus: (request: FieldFocusRequest) => void;
    clearRequest: () => void;
}

export type FieldFocusStore = UseBoundStore<StoreApi<FieldFocusState>>;

// Typed controls come first, so a field with a toolbar focuses where the user writes.
const EDITABLE_SELECTOR = 'textarea, input:not([type="hidden"]), select, [contenteditable="true"]';
const FOCUSABLE_SELECTOR = 'button, [href], [tabindex]:not([tabindex="-1"])';
// Long enough for an editor that builds its DOM after mounting, such as CodeMirror.
const EDITABLE_CONTROL_WAIT_MS = 500;

export function createFieldFocusStore(): FieldFocusStore {
    return create<FieldFocusState>()((set) => ({
        pendingRequest: undefined,
        requestFocus: (request) => set({ pendingRequest: request }),
        clearRequest: () => set({ pendingRequest: undefined }),
    }));
}

// An inspector rendered outside the editor (as in its own tests) never receives a request.
const STORE_WITHOUT_REQUESTS: FieldFocusStore = create<FieldFocusState>()(() => ({
    pendingRequest: undefined,
    requestFocus: doNothing,
    clearRequest: doNothing,
}));

export const FieldFocusContext = createContext<FieldFocusStore>(STORE_WITHOUT_REQUESTS);

/** The id of the node or group the inspector shows; its fields only answer requests for it. */
export const InspectedTargetContext = createContext<string | undefined>(undefined);

export function useRequestFieldFocus(): (request: FieldFocusRequest) => void {
    const fieldFocusStore = use(FieldFocusContext);

    return fieldFocusStore((state) => state.requestFocus);
}

export function useIsFieldFocusRequested(): boolean {
    return useRequestForInspectedTarget() !== undefined;
}

/** Ref for the element around a field; a request for `fieldKey` reveals and focuses it. */
export function useFocusField<FieldElement extends HTMLElement>(
    fieldKey: string,
): RefObject<FieldElement | null> {
    const fieldRef = useRef<FieldElement>(null);
    const request = useRequestForInspectedTarget();
    const fieldFocusStore = use(FieldFocusContext);
    const clearRequest = fieldFocusStore((state) => state.clearRequest);

    useEffect(() => {
        const fieldElement = fieldRef.current;
        if (request?.fieldKey !== fieldKey || !fieldElement) {
            return;
        }

        openEnclosingSections(fieldElement);
        return focusWhenControlAppears(fieldElement, clearRequest);
    }, [request, fieldKey, clearRequest]);

    return fieldRef;
}

function useRequestForInspectedTarget(): FieldFocusRequest | undefined {
    const inspectedTargetId = use(InspectedTargetContext);
    const fieldFocusStore = use(FieldFocusContext);
    const request = fieldFocusStore((state) => state.pendingRequest);
    if (request?.targetId !== inspectedTargetId) {
        return undefined;
    }

    return request;
}

/** Focuses the field's editable control, waiting for it when the field builds it later. */
function focusWhenControlAppears(fieldElement: HTMLElement, onFocused: () => void): () => void {
    if (focusControlMatching(fieldElement, EDITABLE_SELECTOR)) {
        onFocused();
        return doNothing;
    }

    const observer = new MutationObserver(() => {
        if (focusControlMatching(fieldElement, EDITABLE_SELECTOR)) {
            stopWaiting();
            onFocused();
        }
    });
    const fallbackTimer = setTimeout(() => {
        stopWaiting();
        focusControlMatching(fieldElement, FOCUSABLE_SELECTOR);
        onFocused();
    }, EDITABLE_CONTROL_WAIT_MS);
    observer.observe(fieldElement, { childList: true, subtree: true });

    function stopWaiting(): void {
        observer.disconnect();
        clearTimeout(fallbackTimer);
    }

    return stopWaiting;
}

function focusControlMatching(fieldElement: HTMLElement, selector: string): boolean {
    const control = fieldElement.querySelector<HTMLElement>(selector);
    if (!control) {
        return false;
    }

    control.focus();
    return true;
}

function openEnclosingSections(fieldElement: HTMLElement): void {
    let section = fieldElement.closest("details");
    while (section) {
        section.open = true;
        section = section.parentElement?.closest("details") ?? null;
    }
}

function doNothing(): void {}
