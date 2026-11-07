import "@testing-library/jest-dom/vitest";

import { createFakeMatchMedia } from "@/test/fakes/fake_match_media.js";

// jsdom has no matchMedia; without it every component that reads a media query would crash.
if (typeof window !== "undefined") {
    window.matchMedia = createFakeMatchMedia([]);
}

afterEach(() => {
    vi.restoreAllMocks();
});
