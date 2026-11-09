// jsdom has no layout: every element measures 0 px, so a virtualizer would mount every row and could
// never scroll. Each element gets a fixed viewport and row height, and its scroll height comes from
// the inline height a virtualizer puts on its inner list.
export function stubElementSizes(sizes: { viewportHeightPx: number; rowHeightPx: number }): void {
    vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(sizes.viewportHeightPx);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(sizes.rowHeightPx);
    vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(function (this: Element) {
        return Math.max(readFirstChildInlineHeightPx(this), sizes.viewportHeightPx);
    });
}

function readFirstChildInlineHeightPx(element: Element): number {
    const firstChild = element.firstElementChild;
    if (!(firstChild instanceof HTMLElement)) {
        return 0;
    }

    return Number.parseFloat(firstChild.style.height) || 0;
}
