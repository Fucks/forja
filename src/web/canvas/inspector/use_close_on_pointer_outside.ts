import { useEffect } from "react";
import type { RefObject } from "react";

export function useCloseOnPointerOutside(
    containerRef: RefObject<HTMLElement | null>,
    onClose: () => void,
): void {
    useEffect(() => {
        function closeWhenOutside(event: PointerEvent): void {
            const container = containerRef.current;
            if (container && event.target instanceof Node && !container.contains(event.target)) {
                onClose();
            }
        }

        document.addEventListener("pointerdown", closeWhenOutside);
        return () => document.removeEventListener("pointerdown", closeWhenOutside);
    }, [containerRef, onClose]);
}
