import "@testing-library/jest-dom/vitest";

import { installJsdomPolyfills } from "@/test/fakes/jsdom_polyfills.js";

if (typeof window !== "undefined") {
    installJsdomPolyfills();
}

afterEach(() => {
    vi.restoreAllMocks();
});
