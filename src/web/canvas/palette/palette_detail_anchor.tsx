import { useEffect, useRef, useState } from "react";
import type { FocusEvent, JSX, KeyboardEvent, ReactNode, RefObject } from "react";
import { createPortal, flushSync } from "react-dom";

import type { Position } from "@/shared/flow_graph.js";
import { NodePaletteDetail } from "@/web/canvas/palette/node_palette_detail.js";
import { TOOLTIP_OPEN_DELAY_MS } from "@/web/components/ui/tooltip.js";
import { NodeDocDrawer } from "@/web/docs/node_doc_drawer.js";
import type { DocumentedType } from "@/web/docs/node_docs/node_doc.js";
import { getNodeDoc } from "@/web/docs/node_docs/node_docs.js";

const CARD_GAP_PX = 8;
const HOVER_CLOSE_DELAY_MS = 150;

export function PaletteDetailAnchor({
    type,
    children,
}: {
    type: DocumentedType;
    children: ReactNode;
}): JSX.Element {
    const anchorRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const docsButtonRef = useRef<HTMLButtonElement>(null);
    const card = useDetailCardVisibility(anchorRef);
    const [isDocOpen, setIsDocOpen] = useState(false);

    function isInsideDetail(element: EventTarget | null): boolean {
        if (!(element instanceof Node)) {
            return false;
        }

        return [anchorRef, cardRef].some((ref) => ref.current?.contains(element) === true);
    }

    function openOnFocusArriving(event: FocusEvent): void {
        if (!isInsideDetail(event.relatedTarget)) {
            card.open();
        }
    }

    function closeOnFocusLeaving(event: FocusEvent): void {
        if (!isInsideDetail(event.relatedTarget)) {
            card.close();
        }
    }

    function openOrCloseFromKeyboard(event: KeyboardEvent): void {
        if (isMenuKey(event)) {
            event.preventDefault();
            flushSync(card.open);
            docsButtonRef.current?.focus();
            return;
        }
        if (event.key === "Escape" && card.isOpen) {
            event.stopPropagation();
            card.close();
            anchorRef.current?.querySelector("button")?.focus();
        }
    }

    function openDocumentation(): void {
        card.close();
        setIsDocOpen(true);
    }

    // The card is portaled but stays a React child of the anchor, so its pointer, focus and key
    // events reach the anchor's handlers; the drawer stays outside so its focus cannot reopen the card.
    return (
        <>
            <div
                ref={anchorRef}
                onMouseEnter={card.openSoon}
                onMouseLeave={card.closeSoon}
                onFocus={openOnFocusArriving}
                onBlur={closeOnFocusLeaving}
                onKeyDown={openOrCloseFromKeyboard}
            >
                {children}
                {card.position &&
                    createPortal(
                        <NodePaletteDetail
                            cardRef={cardRef}
                            docsButtonRef={docsButtonRef}
                            doc={getNodeDoc(type)}
                            position={card.position}
                            onOpenDocumentation={openDocumentation}
                        />,
                        document.body,
                    )}
            </div>
            <NodeDocDrawer type={type} open={isDocOpen} onOpenChange={setIsDocOpen} />
        </>
    );
}

function isMenuKey(event: KeyboardEvent): boolean {
    return event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
}

interface DetailCardVisibility {
    isOpen: boolean;
    position: Position | undefined;
    open: () => void;
    openSoon: () => void;
    close: () => void;
    closeSoon: () => void;
}

// One timer serves both delays, so a pending close is cancelled when the pointer comes back.
function useDetailCardVisibility(anchorRef: RefObject<HTMLElement | null>): DetailCardVisibility {
    const [position, setPosition] = useState<Position>();
    const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    useEffect(() => () => clearTimeout(timerRef.current), []);

    function open(): void {
        clearTimeout(timerRef.current);
        const anchor = anchorRef.current?.getBoundingClientRect();
        if (anchor) {
            setPosition({ x: anchor.right + CARD_GAP_PX, y: anchor.top });
        }
    }

    function close(): void {
        clearTimeout(timerRef.current);
        setPosition(undefined);
    }

    function runAfter(delayMs: number, action: () => void): void {
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(action, delayMs);
    }

    return {
        isOpen: position !== undefined,
        position,
        open,
        openSoon: () => runAfter(TOOLTIP_OPEN_DELAY_MS, open),
        close,
        closeSoon: () => runAfter(HOVER_CLOSE_DELAY_MS, close),
    };
}
