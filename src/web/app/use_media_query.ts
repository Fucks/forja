import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
    return useSyncExternalStore(
        (notifyChange) => subscribeToMediaQuery(query, notifyChange),
        () => window.matchMedia(query).matches,
    );
}

function subscribeToMediaQuery(query: string, notifyChange: () => void): () => void {
    const mediaQueryList = window.matchMedia(query);
    mediaQueryList.addEventListener("change", notifyChange);

    return () => {
        mediaQueryList.removeEventListener("change", notifyChange);
    };
}
