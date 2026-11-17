import { useEffect } from "react";

export function useCloseOnOutsideInteraction(
    elementRef: { current: HTMLElement | null },
    onClose: () => void,
): void {
    useEffect(() => {
        function closeOnEscape(event: KeyboardEvent): void {
            if (event.key === "Escape") {
                onClose();
            }
        }
        function closeOnPointerOutside(event: PointerEvent): void {
            const isInside =
                event.target instanceof Node && elementRef.current?.contains(event.target);
            if (!isInside) {
                onClose();
            }
        }

        document.addEventListener("keydown", closeOnEscape);
        document.addEventListener("pointerdown", closeOnPointerOutside);
        return () => {
            document.removeEventListener("keydown", closeOnEscape);
            document.removeEventListener("pointerdown", closeOnPointerOutside);
        };
    }, [elementRef, onClose]);
}
