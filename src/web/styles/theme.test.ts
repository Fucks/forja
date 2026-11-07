import { THEME_STORAGE_KEY, applyTheme, readStoredTheme } from "@/web/styles/theme.js";

beforeEach(() => {
    localStorage.clear();
});

describe("readStoredTheme", () => {
    it("defaults to the dark theme when nothing is stored", () => {
        const theme = readStoredTheme(localStorage);

        expect(theme).toBe("dark");
    });

    it("falls back to the dark theme when the stored value is not a theme", () => {
        localStorage.setItem(THEME_STORAGE_KEY, "sepia");

        const theme = readStoredTheme(localStorage);

        expect(theme).toBe("dark");
    });

    it("returns the light theme when it was stored", () => {
        localStorage.setItem(THEME_STORAGE_KEY, "light");

        const theme = readStoredTheme(localStorage);

        expect(theme).toBe("light");
    });
});

describe("applyTheme", () => {
    it("sets data-theme on the root element", () => {
        const root = document.createElement("html");

        applyTheme("light", root, localStorage);

        expect(root.dataset.theme).toBe("light");
    });

    it("stores the theme so it survives a reload", () => {
        applyTheme("light", document.createElement("html"), localStorage);

        expect(readStoredTheme(localStorage)).toBe("light");
    });
});
