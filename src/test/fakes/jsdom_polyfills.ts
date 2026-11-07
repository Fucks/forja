import { createFakeMatchMedia } from "@/test/fakes/fake_match_media.js";

// jsdom lacks these browser APIs; Radix primitives and media-query hooks crash without them.
export function installJsdomPolyfills(): void {
    window.matchMedia = createFakeMatchMedia([]);
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.releasePointerCapture = () => undefined;
    Element.prototype.scrollIntoView = () => undefined;
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    };
}
