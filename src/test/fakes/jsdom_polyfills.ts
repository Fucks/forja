import { FakeEventSource } from "@/test/fakes/fake_event_source.js";
import { createFakeMatchMedia } from "@/test/fakes/fake_match_media.js";

// jsdom lacks these browser APIs; Radix, CodeMirror, media-query and event-stream hooks crash
// without them.
export function installJsdomPolyfills(): void {
    window.matchMedia = createFakeMatchMedia([]);
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.releasePointerCapture = () => undefined;
    Element.prototype.scrollIntoView = () => undefined;
    Element.prototype.scrollTo = scrollElementTo;
    Range.prototype.getClientRects = () => emptyRectList();
    Range.prototype.getBoundingClientRect = () => new DOMRect();
    // Pages that follow the live events open a stream that never connects instead of crashing.
    vi.stubGlobal("EventSource", FakeEventSource);
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    };
}

// CodeMirror measures text through ranges, which jsdom does not lay out.
function emptyRectList(): DOMRectList {
    const rects: DOMRect[] = [];

    return Object.assign(rects, { item: (index: number) => rects[index] ?? null });
}

// Virtualized lists scroll with element.scrollTo and react to the resulting "scroll" event.
function scrollElementTo(
    this: Element,
    optionsOrLeft?: ScrollToOptions | number,
    top?: number,
): void {
    const nextTop = typeof optionsOrLeft === "object" ? optionsOrLeft.top : top;
    if (nextTop === undefined) {
        return;
    }

    this.scrollTop = nextTop;
    this.dispatchEvent(new Event("scroll"));
}
