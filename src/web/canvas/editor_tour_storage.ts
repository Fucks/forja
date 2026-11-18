export const EDITOR_TOUR_DISMISSED_KEY = "forja.editorTour.dismissed";
export const EDITOR_TOUR_DISMISSED_VALUE = "true";

// An unavailable storage (private mode, blocked cookies) only means the choice is not remembered.
export function isEditorTourDismissed(): boolean {
    try {
        return localStorage.getItem(EDITOR_TOUR_DISMISSED_KEY) === EDITOR_TOUR_DISMISSED_VALUE;
    } catch {
        return false;
    }
}

export function rememberEditorTourDismissed(): void {
    try {
        localStorage.setItem(EDITOR_TOUR_DISMISSED_KEY, EDITOR_TOUR_DISMISSED_VALUE);
    } catch {
        // See isEditorTourDismissed: the tour then opens again next time.
    }
}
